import type { PublishedPage, User } from "../shared/types";
import type { Env } from "./env";
import { PageError } from "./errors";

/** Stored alongside the HTML. KV caps metadata at 1 KB, so keep it short. */
export interface PageMeta {
  n?: string; // original filename
  t?: number; // created, epoch ms
  s?: number; // bytes
  u?: string; // owner user id
}

export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PAGES = 100;

const PAGE_PREFIX = "page:";
const USER_PAGE_PREFIX = "user:";
const ID_LEN = 7;
const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no l/o/0/1

/**
 * Hosted pages share an origin with the dashboard. Sandbox keeps uploaded HTML
 * from reading cookies/localStorage on the dashboard origin.
 */
const SANDBOX_PAGES = true;

export function describe(
  origin: string,
  id: string,
  name: string,
  size: number,
  created: number,
): PublishedPage {
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

export async function publishPage(
  env: Env,
  origin: string,
  user: User,
  input: { body: string; name?: string; slug?: string },
): Promise<PublishedPage> {
  const body = input.body;
  const name = input.name ?? "";
  const slug = input.slug ?? "";

  if (!body.trim()) throw new PageError("The file is empty.", 400);

  const size = new TextEncoder().encode(body).length;
  if (size > MAX_BYTES) {
    const mb = Math.round(MAX_BYTES / 1_048_576);
    throw new PageError(`That file is over the ${mb} MB limit.`, 413);
  }

  // No custom link? Fall back to the file name, then to a random id.
  const id = slug ? slugify(slug) : slugify(name) || makeId();
  if (!id) throw new PageError("That custom link name has no usable characters.", 400);

  const existing = await getPageMeta(env, pageKey(id));
  const legacy = existing ? null : await getPageMeta(env, id);
  if (legacy) throw new PageError("That custom link is already taken.", 409);
  if (existing && existing.u !== user.id) {
    throw new PageError("That custom link is already taken.", 409);
  }

  const userPages = await getUserPages(env, user.id);
  if (!userPages.includes(id) && userPages.length >= MAX_PAGES) {
    throw new PageError(`You have reached the ${MAX_PAGES} page limit.`, 403);
  }

  const created = Date.now();
  const metadata: PageMeta = { n: name.slice(0, 120), t: created, s: size, u: user.id };
  await env.SITES.put(pageKey(id), body, { metadata });
  if (!userPages.includes(id)) {
    userPages.unshift(id);
    await putUserPages(env, user.id, userPages);
  }

  return describe(origin, id, name, size, created);
}

export async function listUserPages(env: Env, origin: string, user: User): Promise<PublishedPage[]> {
  const ids = await getUserPages(env, user.id);
  const pages = (
    await Promise.all(
      ids.map(async (id) => {
        const { value, metadata } = await env.SITES.getWithMetadata<PageMeta>(pageKey(id), {
          type: "stream",
        });
        if (value === null) return null;
        await value.cancel();
        const meta = metadata ?? {};
        return describe(origin, id, meta.n ?? "", meta.s ?? 0, meta.t ?? 0);
      }),
    )
  )
    .filter((page): page is PublishedPage => page !== null)
    .sort((a, b) => b.created - a.created);
  return pages;
}

export async function deleteOwnedPage(env: Env, id: string, user: User): Promise<void> {
  const { value, metadata } = await env.SITES.getWithMetadata<PageMeta>(pageKey(id), {
    type: "stream",
  });
  if (value === null) return;
  await value.cancel();
  if (metadata?.u && metadata.u !== user.id) {
    throw new PageError("You can only delete your own pages.", 403);
  }
  await env.SITES.delete(pageKey(id));
  const pages = await getUserPages(env, user.id);
  await putUserPages(
    env,
    user.id,
    pages.filter((pageId) => pageId !== id),
  );
}

export async function servePage(rest: string, env: Env): Promise<Response> {
  const [id, mode] = rest.split("/");
  if (!id) return pageNotFound("");

  let { value, metadata } = await env.SITES.getWithMetadata<PageMeta>(pageKey(id), { type: "text" });
  if (value === null) {
    const legacy = await env.SITES.getWithMetadata<PageMeta>(id, { type: "text" });
    value = legacy.value;
    metadata = legacy.metadata;
  }
  if (value === null) return pageNotFound(id);

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

async function getPageMeta(env: Env, key: string): Promise<PageMeta | null> {
  const { value, metadata } = await env.SITES.getWithMetadata<PageMeta>(key, { type: "stream" });
  if (value === null) return null;
  await value.cancel();
  return metadata ?? {};
}

async function getUserPages(env: Env, userId: string): Promise<string[]> {
  const pages = await env.SITES.get<string[]>(userPagesKey(userId), { type: "json" });
  return Array.isArray(pages)
    ? pages.filter((id) => typeof id === "string").slice(0, MAX_PAGES)
    : [];
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

function pageKey(id: string): string {
  return `${PAGE_PREFIX}${id}`;
}

function userPagesKey(userId: string): string {
  return `${USER_PAGE_PREFIX}${userId}:pages`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/\.html?$/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function pageNotFound(id: string): Response {
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
