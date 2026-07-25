import type { ErrorResponse } from "../shared/types";
import { PageError } from "./errors";
import { MAX_BYTES } from "./pages";

export { PageError } from "./errors";

export function json<T>(data: T, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

export function cors(res: Response): Response {
  res.headers.set("access-control-allow-origin", "*");
  res.headers.set("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.headers.set(
    "access-control-allow-headers",
    "content-type,authorization,x-auth-token,x-file-name,x-slug,mcp-session-id",
  );
  return res;
}

export function tooLarge(): Response {
  const mb = Math.round(MAX_BYTES / 1_048_576);
  return json<ErrorResponse>({ error: `That file is over the ${mb} MB limit.` }, 413);
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

export function pageErrorResponse(err: unknown): Response {
  if (err instanceof PageError) {
    return json<ErrorResponse>({ error: err.message }, err.status);
  }
  const message = err instanceof Error ? err.message : String(err);
  return json<ErrorResponse>({ error: message }, 500);
}
