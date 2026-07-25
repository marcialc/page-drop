import type {
  ConfigResponse,
  ListResponse,
  McpResponse,
  MeResponse,
  PublishedPage,
  User,
} from "../../shared/types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export async function getConfig(): Promise<ConfigResponse> {
  const response = await fetch("/api/config");
  return parse<ConfigResponse>(response);
}

export async function getMe(): Promise<User | null> {
  const response = await fetch("/api/me");
  const data = await parse<MeResponse>(response);
  return data.user;
}

export async function loginWithGoogle(credential: string): Promise<User> {
  const response = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  const data = await parse<MeResponse>(response);
  if (!data.user) throw new ApiError("Google login failed.", 401);
  return data.user;
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/logout", { method: "POST" });
  await parse<{ ok: boolean }>(response);
}

export async function uploadHtml(
  html: string,
  options: { name?: string; slug?: string },
): Promise<PublishedPage> {
  const headers: Record<string, string> = { "Content-Type": "text/html" };
  if (options.name) headers["X-File-Name"] = encodeURIComponent(options.name);
  if (options.slug) headers["X-Slug"] = options.slug;

  const response = await fetch("/api/upload", { method: "POST", headers, body: html });
  return parse<PublishedPage>(response);
}

export async function listPages(): Promise<PublishedPage[]> {
  const response = await fetch("/api/list");
  const data = await parse<ListResponse>(response);
  return data.pages;
}

export async function getMcpConnection(): Promise<McpResponse> {
  const response = await fetch("/api/mcp");
  return parse<McpResponse>(response);
}

export async function rotateMcpConnection(): Promise<McpResponse> {
  const response = await fetch("/api/mcp/rotate", { method: "POST" });
  return parse<McpResponse>(response);
}

export async function deletePage(id: string): Promise<void> {
  const response = await fetch(`/api/page/${id}`, { method: "DELETE" });
  await parse<{ ok: boolean }>(response);
}
