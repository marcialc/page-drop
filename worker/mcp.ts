import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { User } from "../shared/types";
import { authenticate } from "./auth";
import type { Env } from "./env";
import { PageError } from "./errors";
import { cors, json } from "./http";
import { resolveMcpKey } from "./mcpkey";
import { deleteOwnedPage, listUserPages, MAX_BYTES, MAX_PAGES, publishPage } from "./pages";

const ROUTE = "/mcp";
const KEY_PATH_PREFIX = `${ROUTE}/`;

export async function handleMcp(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const resolved = await resolveMcpUser(request, env, url);
  if (resolved instanceof Response) return cors(resolved);

  const server = createPageDropServer(env, url.origin, resolved);
  return createMcpHandler(server, {
    route: ROUTE,
    corsOptions: {
      origin: "*",
      methods: "GET, POST, DELETE, OPTIONS",
      headers: "Content-Type, Authorization, mcp-session-id, x-auth-token",
      exposeHeaders: "mcp-session-id",
    },
  })(atRoute(request, url), env, ctx);
}

/**
 * Credentials, in the order a client is likely to have them: the key baked into
 * the URL (connector UIs), then a Bearer header or `?key=` (Claude Code, curl),
 * then the browser session / admin AUTH_TOKEN.
 */
async function resolveMcpUser(request: Request, env: Env, url: URL): Promise<User | Response> {
  const pathKey = url.pathname.startsWith(KEY_PATH_PREFIX)
    ? url.pathname.slice(KEY_PATH_PREFIX.length).split("/")[0]
    : "";
  const header = request.headers.get("authorization") ?? "";
  const candidate =
    pathKey ||
    url.searchParams.get("key") ||
    (header.startsWith("Bearer ") ? header.slice(7) : "");

  if (candidate) {
    const user = await resolveMcpKey(env, candidate);
    if (user) return user;
    // A key-shaped credential that resolves to nothing is a revoked or mistyped
    // key. Say so instead of falling through to a generic "sign in" error.
    if (pathKey) return mcpAuthError("That PageDrop MCP key is not valid. It may have been rotated — copy the current URL from your PageDrop dashboard.");
  }

  const auth = await authenticate(request, env, url);
  if (auth instanceof Response) {
    return mcpAuthError("This endpoint needs your personal PageDrop MCP URL. Sign in at PageDrop and copy the URL that ends in /mcp/<your key>.");
  }
  return auth;
}

/** The handler only matches its configured route, so strip the key segment off. */
function atRoute(request: Request, url: URL): Request {
  if (url.pathname === ROUTE) return request;
  const rewritten = new URL(url);
  rewritten.pathname = ROUTE;
  return new Request(rewritten, request);
}

/**
 * 403, not 401: without an OAuth authorization server to point at, a 401 sends
 * MCP clients into a discovery flow that can only dead-end. 403 surfaces the
 * message instead.
 */
function mcpAuthError(message: string): Response {
  return json({ error: message }, 403);
}

function createPageDropServer(env: Env, origin: string, user: User): McpServer {
  const server = new McpServer({
    name: "pagedrop",
    version: "1.0.0",
  });

  server.tool(
    "publish_html",
    `Publish an HTML document to PageDrop and get a public URL. Max ${Math.round(MAX_BYTES / 1_048_576)} MB per page, ${MAX_PAGES} pages per account. Always return the url field to the user.`,
    {
      html: z.string().describe("Full HTML document to publish"),
      name: z.string().optional().describe("Original filename, e.g. demo.html"),
      slug: z
        .string()
        .optional()
        .describe("Optional custom link id (letters, numbers, hyphens). Overwrites own pages with the same slug."),
    },
    async ({ html, name, slug }) => {
      try {
        const page = await publishPage(env, origin, user, {
          body: html,
          name: name ?? "mcp.html",
          slug,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(page, null, 2) }],
        };
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.tool(
    "list_pages",
    "List pages you have published on PageDrop (id, name, size, urls).",
    {},
    async () => {
      try {
        const pages = await listUserPages(env, origin, user);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ pages }, null, 2) }],
        };
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.tool(
    "delete_page",
    "Delete one of your published pages by id. The public link stops working.",
    {
      id: z.string().describe("Page id (from list_pages or publish_html)"),
    },
    async ({ id }) => {
      try {
        await deleteOwnedPage(env, id, user);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ ok: true, id }, null, 2) }],
        };
      } catch (err) {
        return toolError(err);
      }
    },
  );

  return server;
}

function toolError(err: unknown) {
  const message =
    err instanceof PageError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}
