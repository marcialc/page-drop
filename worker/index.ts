import type { ErrorResponse, ListResponse, PublishedPage } from "../shared/types";

export interface Env {
  SITES: KVNamespace;
  ASSETS: Fetcher;
  /** Set with `wrangler secret put AUTH_TOKEN`. Unset = anyone can publish. */
  AUTH_TOKEN?: string;
}

/** Stored alongside the HTML. KV caps metadata at 1 KB, so keep it short. */
interface PageMeta {
  n?: string; // original filename
  t?: number; // created, epoch ms
  s?: number; // bytes
}

const MAX_BYTES = 5 * 1024 * 1024; // KV allows up to 25 MiB per value
const ID_LEN = 7;
const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no l/o/0/1

/**
 * Hosted pages share an origin with the dashboard. Fine while you're the only
 * one uploading. If you open it up, set this to true — pages then run in an
 * opaque origin and can't touch your key. Trade-off: localStorage stops
 * working inside hosted pages.
 */
const SANDBOX_PAGES = false;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    try {
      if (pathname === "/api/upload" && (request.method === "POST" || request.method === "PUT")) {
        return cors(await handleUpload(request, env, url));
      }

      if (pathname === "/api/list" && request.method === "GET") {
        const denied = authorize(request, env, url);
        return cors(denied ?? (await handleList(env, url)));
      }

      if (pathname.startsWith("/api/page/") && request.method === "DELETE") {
        const denied = authorize(request, env, url);
        if (denied) return cors(denied);
        await env.SITES.delete(pathname.slice("/api/page/".length));
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
  const denied = authorize(request, env, url);
  if (denied) return denied;

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
  if (size > MAX_BYTES) {
    const mb = Math.round(MAX_BYTES / 1_048_576);
    return json<ErrorResponse>({ error: `That file is over the ${mb} MB limit.` }, 413);
  }

  const id = slug ? slugify(slug) : makeId();
  if (!id) return json<ErrorResponse>({ error: "That custom link name has no usable characters." }, 400);

  const created = Date.now();
  const metadata: PageMeta = { n: name.slice(0, 120), t: created, s: size };
  await env.SITES.put(id, body, { metadata });

  return json<PublishedPage>(describe(url.origin, id, name, size, created), 201);
}

/* -------------------------------------------------------------------- read */

async function handleServe(rest: string, env: Env): Promise<Response> {
  const [id, mode] = rest.split("/");
  if (!id) return notFound("");

  const { value, metadata } = await env.SITES.getWithMetadata<PageMeta>(id, { type: "text" });
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

async function handleList(env: Env, url: URL): Promise<Response> {
  const listed = await env.SITES.list<PageMeta>({ limit: 200 });
  const pages = listed.keys
    .map((key) => {
      const meta = key.metadata ?? {};
      return describe(url.origin, key.name, meta.n ?? "", meta.s ?? 0, meta.t ?? 0);
    })
    .sort((a, b) => b.created - a.created);
  return json<ListResponse>({ pages });
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

/** Returns a 401 Response when the key is wrong, or null when the caller is allowed. */
function authorize(request: Request, env: Env, url: URL): Response | null {
  const expected = env.AUTH_TOKEN;
  if (!expected) return null; // no secret set = open instance
  const header = request.headers.get("authorization") ?? "";
  const given =
    (header.startsWith("Bearer ") ? header.slice(7) : "") ||
    request.headers.get("x-auth-token") ||
    url.searchParams.get("token") ||
    "";
  return given === expected ? null : json<ErrorResponse>({ error: "Wrong or missing key." }, 401);
}

function makeId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LEN));
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/\.html?$/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
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
