import type { ConfigResponse, ErrorResponse, ListResponse, MeResponse, PublishedPage, User } from "../shared/types";

export interface Env {
  SITES: KVNamespace;
  ASSETS: Fetcher;
  /** Google OAuth web client id. Client ids are public, but config keeps deploys flexible. */
  GOOGLE_CLIENT_ID?: string;
  /** Optional legacy/admin key. Set with `wrangler secret put AUTH_TOKEN`. */
  AUTH_TOKEN?: string;
}

/** Stored alongside the HTML. KV caps metadata at 1 KB, so keep it short. */
interface PageMeta {
  n?: string; // original filename
  t?: number; // created, epoch ms
  s?: number; // bytes
  u?: string; // owner user id
}

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

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 100;
const PAGE_PREFIX = "page:";
const USER_PAGE_PREFIX = "user:";
const SESSION_PREFIX = "session:";
const SESSION_COOKIE = "pd_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const ID_LEN = 7;
const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no l/o/0/1

/**
 * Hosted pages share an origin with the dashboard. Fine while you're the only
 * one uploading. If you open it up, set this to true — pages then run in an
 * opaque origin and can't touch your key. Trade-off: localStorage stops
 * working inside hosted pages.
 */
const SANDBOX_PAGES = true;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    try {
      if (pathname === "/api/config" && request.method === "GET") {
        return cors(json<ConfigResponse>({
          googleClientId: env.GOOGLE_CLIENT_ID ?? "",
          limits: { maxUploadBytes: MAX_BYTES, maxPages: MAX_PAGES },
        }));
      }

      if (pathname === "/api/me" && request.method === "GET") {
        const session = await getSession(request, env);
        return cors(json<MeResponse>({ user: session?.user ?? null }));
      }

      if (pathname === "/api/auth/google" && request.method === "POST") {
        return cors(await handleGoogleLogin(request, env, url));
      }

      if (pathname === "/api/logout" && request.method === "POST") {
        return cors(await handleLogout(request, env, url));
      }

      if (pathname === "/api/upload" && (request.method === "POST" || request.method === "PUT")) {
        return cors(await handleUpload(request, env, url));
      }

      if (pathname === "/api/list" && request.method === "GET") {
        return cors(await handleList(request, env, url));
      }

      if (pathname.startsWith("/api/page/") && request.method === "DELETE") {
        const auth = await authenticate(request, env, url);
        if (auth instanceof Response) return cors(auth);
        await deleteOwnedPage(pathname.slice("/api/page/".length), auth, env);
        return cors(json({ ok: true }));
      }

      if (pathname.startsWith("/p/")) {
        return handleServe(pathname.slice(3), env);
      }

      // Anything else is the React app (or a static asset).
      return env.ASSETS.fetch(request);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return cors(json<ErrorResponse>({ error: message }, 500));
    }
  },
} satisfies ExportedHandler<Env>;

/* ------------------------------------------------------------------ upload */

async function handleUpload(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(request, env, url);
  if (auth instanceof Response) return auth;

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BYTES) return tooLarge();

  let body = "";
  let name = "";
  let slug = url.searchParams.get("slug") ?? "";
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const entry = form.get("file") ?? form.get("html");
    if (!entry) return json<ErrorResponse>({ error: "No file field in the form data." }, 400);
    if (typeof entry === "string") {
      body = entry;
    } else {
      body = await entry.text();
      name = entry.name;
    }
    slug ||= String(form.get("slug") ?? "");
  } else {
    body = await request.text();
    name = decodeURIComponent(request.headers.get("x-file-name") ?? "");
    slug ||= request.headers.get("x-slug") ?? "";
  }

  if (!body.trim()) return json<ErrorResponse>({ error: "The file is empty." }, 400);

  const size = new TextEncoder().encode(body).length;
  if (size > MAX_BYTES) return tooLarge();

  const id = slug ? slugify(slug) : makeId();
  if (!id) return json<ErrorResponse>({ error: "That custom link name has no usable characters." }, 400);

  const existing = await getPageMeta(env, pageKey(id));
  const legacy = existing ? null : await getPageMeta(env, id);
  if (legacy) {
    return json<ErrorResponse>({ error: "That custom link is already taken." }, 409);
  }
  if (existing && existing.u !== auth.id) {
    return json<ErrorResponse>({ error: "That custom link is already taken." }, 409);
  }

  const userPages = await getUserPages(env, auth.id);
  if (!userPages.includes(id) && userPages.length >= MAX_PAGES) {
    return json<ErrorResponse>({ error: `You have reached the ${MAX_PAGES} page limit.` }, 403);
  }

  const created = Date.now();
  const metadata: PageMeta = { n: name.slice(0, 120), t: created, s: size, u: auth.id };
  await env.SITES.put(pageKey(id), body, { metadata });
  if (!userPages.includes(id)) {
    userPages.unshift(id);
    await putUserPages(env, auth.id, userPages);
  }

  return json<PublishedPage>(describe(url.origin, id, name, size, created), 201);
}

/* -------------------------------------------------------------------- read */

async function handleServe(rest: string, env: Env): Promise<Response> {
  const [id, mode] = rest.split("/");
  if (!id) return notFound("");

  let { value, metadata } = await env.SITES.getWithMetadata<PageMeta>(pageKey(id), { type: "text" });
  if (value === null) {
    const legacy = await env.SITES.getWithMetadata<PageMeta>(id, { type: "text" });
    value = legacy.value;
    metadata = legacy.metadata;
  }
  if (value === null) return notFound(id);

  const meta = metadata ?? {};
  const filename = (meta.n || `${id}.html`).replace(/[^\w.\-]+/g, "_");
  const headers = new Headers({
    "cache-control": "public, max-age=0, must-revalidate",
    etag: `"${id}-${meta.t ?? 0}"`,
  });

  if (mode === "raw") {
    headers.set("content-type", "text/plain; charset=utf-8");
  } else if (mode === "download") {
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("content-disposition", `attachment; filename="${filename}"`);
  } else {
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("x-content-type-options", "nosniff");
    if (SANDBOX_PAGES) {
      headers.set(
        "content-security-policy",
        "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads",
      );
    }
  }

  return new Response(value, { headers });
}

async function handleList(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(request, env, url);
  if (auth instanceof Response) return auth;

  const ids = await getUserPages(env, auth.id);
  const pages = (await Promise.all(
    ids.map(async (id) => {
      const { value, metadata } = await env.SITES.getWithMetadata<PageMeta>(pageKey(id), { type: "stream" });
      if (value === null) return null;
      await value.cancel();
      const meta = metadata ?? {};
      return describe(url.origin, id, meta.n ?? "", meta.s ?? 0, meta.t ?? 0);
    }),
  ))
    .filter((page): page is PublishedPage => page !== null)
    .sort((a, b) => b.created - a.created);
  return json<ListResponse>({ pages });
}

/* -------------------------------------------------------------------- auth */

async function handleGoogleLogin(request: Request, env: Env, url: URL): Promise<Response> {
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

async function handleLogout(request: Request, env: Env, url: URL): Promise<Response> {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.SITES.delete(sessionKey(token));
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", url, 0) });
}

async function authenticate(request: Request, env: Env, url: URL): Promise<User | Response> {
  const session = await getSession(request, env);
  if (session) return session.user;

  const admin = authorizeAdmin(request, env, url);
  if (admin) return admin;

  return json<ErrorResponse>({ error: "Sign in with Google to publish pages." }, 401);
}

async function getSession(request: Request, env: Env): Promise<Session | null> {
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

/* ------------------------------------------------------------------- utils */

function describe(origin: string, id: string, name: string, size: number, created: number): PublishedPage {
  return {
    id,
    name,
    size,
    created,
    url: `${origin}/p/${id}`,
    raw: `${origin}/p/${id}/raw`,
    download: `${origin}/p/${id}/download`,
  };
}

async function deleteOwnedPage(id: string, user: User, env: Env): Promise<void> {
  const { value, metadata } = await env.SITES.getWithMetadata<PageMeta>(pageKey(id), { type: "stream" });
  if (value === null) return;
  await value.cancel();
  if (metadata?.u && metadata.u !== user.id) throw new Error("You can only delete your own pages.");
  await env.SITES.delete(pageKey(id));
  const pages = await getUserPages(env, user.id);
  await putUserPages(env, user.id, pages.filter((pageId) => pageId !== id));
}

async function getPageMeta(env: Env, key: string): Promise<PageMeta | null> {
  const { value, metadata } = await env.SITES.getWithMetadata<PageMeta>(key, { type: "stream" });
  if (value === null) return null;
  await value.cancel();
  return metadata ?? {};
}

async function getUserPages(env: Env, userId: string): Promise<string[]> {
  const pages = await env.SITES.get<string[]>(userPagesKey(userId), { type: "json" });
  return Array.isArray(pages) ? pages.filter((id) => typeof id === "string").slice(0, MAX_PAGES) : [];
}

async function putUserPages(env: Env, userId: string, pages: string[]): Promise<void> {
  await env.SITES.put(userPagesKey(userId), JSON.stringify(pages.slice(0, MAX_PAGES)));
}

function makeId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LEN));
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

function makeSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Url(bytes);
}

function pageKey(id: string): string {
  return `${PAGE_PREFIX}${id}`;
}

function userPagesKey(userId: string): string {
  return `${USER_PAGE_PREFIX}${userId}:pages`;
}

function sessionKey(token: string): string {
  return `${SESSION_PREFIX}${token}`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/\.html?$/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function json<T>(data: T, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function cors(res: Response): Response {
  res.headers.set("access-control-allow-origin", "*");
  res.headers.set("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.headers.set(
    "access-control-allow-headers",
    "content-type,authorization,x-auth-token,x-file-name,x-slug",
  );
  return res;
}

function tooLarge(): Response {
  const mb = Math.round(MAX_BYTES / 1_048_576);
  return json<ErrorResponse>({ error: `That file is over the ${mb} MB limit.` }, 413);
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

function notFound(id: string): Response {
  const safe = id.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>No page here</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#E6E8EC;color:#14161A;
font:500 15px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center}
b{display:block;font-size:34px;letter-spacing:-.02em;margin-bottom:8px}a{color:#1B39FF}</style>
<div><b>404</b>Nothing is published at /p/${safe}.<br>It may have been deleted.<br><br><a href="/">Go to PageDrop</a></div>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
