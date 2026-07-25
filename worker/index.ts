import type {
  ConfigResponse,
  ErrorResponse,
  ListResponse,
  MeResponse,
  PublishedPage,
} from "../shared/types";
import { authenticate, getSession, handleGoogleLogin, handleLogout } from "./auth";
import type { Env } from "./env";
import { cors, json, pageErrorResponse, tooLarge } from "./http";
import { handleMcp } from "./mcp";
import {
  deleteOwnedPage,
  listUserPages,
  MAX_BYTES,
  MAX_PAGES,
  publishPage,
  servePage,
} from "./pages";

export type { Env };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    try {
      if (pathname === "/mcp" || pathname.startsWith("/mcp/")) {
        return handleMcp(request, env, ctx);
      }

      if (pathname === "/api/config" && request.method === "GET") {
        return cors(
          json<ConfigResponse>({
            googleClientId: env.GOOGLE_CLIENT_ID ?? "",
            limits: { maxUploadBytes: MAX_BYTES, maxPages: MAX_PAGES },
          }),
        );
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
        try {
          await deleteOwnedPage(env, pathname.slice("/api/page/".length), auth);
          return cors(json({ ok: true }));
        } catch (err) {
          return cors(pageErrorResponse(err));
        }
      }

      if (pathname.startsWith("/p/")) {
        return servePage(pathname.slice(3), env);
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return cors(json<ErrorResponse>({ error: message }, 500));
    }
  },
} satisfies ExportedHandler<Env>;

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

  try {
    const page = await publishPage(env, url.origin, auth, { body, name, slug });
    return json<PublishedPage>(page, 201);
  } catch (err) {
    return pageErrorResponse(err);
  }
}

async function handleList(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await authenticate(request, env, url);
  if (auth instanceof Response) return auth;

  try {
    const pages = await listUserPages(env, url.origin, auth);
    return json<ListResponse>({ pages });
  } catch (err) {
    return pageErrorResponse(err);
  }
}
