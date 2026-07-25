import type { ErrorResponse, MeResponse, User } from "../shared/types";
import type { Env } from "./env";
import { json, readJson } from "./http";

interface Session {
  user: User;
  exp: number;
}

interface GoogleHeader {
  alg?: string;
  kid?: string;
}

interface GoogleClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  exp?: number;
}

interface JsonWebKeySet {
  keys: GoogleJsonWebKey[];
}

interface GoogleJsonWebKey extends JsonWebKey {
  kid?: string;
}

const SESSION_PREFIX = "session:";
const SESSION_COOKIE = "pd_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export async function handleGoogleLogin(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID) {
    return json<ErrorResponse>({ error: "Google login is not configured." }, 500);
  }

  const body = await readJson<{ credential?: string }>(request);
  if (!body.credential) return json<ErrorResponse>({ error: "Missing Google credential." }, 400);

  const claims = await verifyGoogleIdToken(body.credential, env.GOOGLE_CLIENT_ID);
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  if (!claims.sub || !claims.email || !emailVerified) {
    return json<ErrorResponse>({ error: "Google account email is not verified." }, 401);
  }

  const user: User = {
    id: claims.sub,
    email: claims.email,
    name: claims.name ?? claims.email,
    picture: claims.picture ?? "",
  };
  const token = makeSessionToken();
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  await env.SITES.put(sessionKey(token), JSON.stringify({ user, exp } satisfies Session), {
    expirationTtl: SESSION_SECONDS,
  });

  return json<MeResponse>({ user }, 200, { "set-cookie": sessionCookie(token, url, SESSION_SECONDS) });
}

export async function handleLogout(request: Request, env: Env, url: URL): Promise<Response> {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.SITES.delete(sessionKey(token));
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", url, 0) });
}

/** Session cookie first, then optional AUTH_TOKEN as admin. */
export async function authenticate(
  request: Request,
  env: Env,
  url: URL,
): Promise<User | Response> {
  const session = await getSession(request, env);
  if (session) return session.user;

  const admin = authorizeAdmin(request, env, url);
  if (admin) return admin;

  return json<ErrorResponse>({ error: "Sign in with Google to publish pages." }, 401);
}

export async function getSession(request: Request, env: Env): Promise<Session | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const session = await env.SITES.get<Session>(sessionKey(token), { type: "json" });
  if (!session || session.exp <= Math.floor(Date.now() / 1000)) return null;
  return session;
}

function authorizeAdmin(request: Request, env: Env, url: URL): User | null {
  const expected = env.AUTH_TOKEN;
  if (!expected) return null;
  const header = request.headers.get("authorization") ?? "";
  const given =
    (header.startsWith("Bearer ") ? header.slice(7) : "") ||
    request.headers.get("x-auth-token") ||
    url.searchParams.get("token") ||
    "";
  if (!constantTimeEqual(given, expected)) return null;
  return { id: "admin", email: "admin", name: "Admin", picture: "" };
}

async function verifyGoogleIdToken(credential: string, clientId: string): Promise<GoogleClaims> {
  const [encodedHeader, encodedPayload, encodedSignature] = credential.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("Invalid Google credential.");
  }

  const header = decodeJwtPart<GoogleHeader>(encodedHeader);
  const claims = decodeJwtPart<GoogleClaims>(encodedPayload);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Google credential.");
  if (claims.aud !== clientId) throw new Error("Google credential was issued for a different app.");
  if (claims.iss !== "accounts.google.com" && claims.iss !== "https://accounts.google.com") {
    throw new Error("Google credential issuer is invalid.");
  }
  if (!claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("Google credential has expired.");
  }

  const jwksResponse = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!jwksResponse.ok) throw new Error("Could not fetch Google signing keys.");
  const jwks = await jwksResponse.json<JsonWebKeySet>();
  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Google signing key was not found.");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!ok) throw new Error("Google credential signature is invalid.");
  return claims;
}

function makeSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

function sessionKey(token: string): string {
  return `${SESSION_PREFIX}${token}`;
}

function getCookie(request: Request, name: string): string {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function sessionCookie(value: string, url: URL, maxAge: number): string {
  const secure = url.hostname === "localhost" || url.hostname === "127.0.0.1" ? "" : "; Secure";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function decodeJwtPart<T>(encoded: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as T;
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}
