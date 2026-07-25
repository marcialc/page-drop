import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { User } from "../shared/types";
import { authenticate } from "./auth";
import type { Env } from "./env";
import { PageError } from "./errors";
import { cors } from "./http";
import { deleteOwnedPage, listUserPages, MAX_BYTES, MAX_PAGES, publishPage } from "./pages";

export async function handleMcp(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const auth = await authenticate(request, env, url);
  if (auth instanceof Response) return cors(auth);

  const server = createPageDropServer(env, url.origin, auth);
  return createMcpHandler(server, {
    route: "/mcp",
    corsOptions: {
      origin: "*",
      methods: "GET, POST, DELETE, OPTIONS",
      headers: "Content-Type, Authorization, mcp-session-id, x-auth-token",
      exposeHeaders: "mcp-session-id",
    },
  })(request, env, ctx);
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
