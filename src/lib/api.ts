import type { ListResponse, PublishedPage } from "../../shared/types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function withAuth(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
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

export async function uploadHtml(
  html: string,
  options: { name?: string; slug?: string },
  token: string,
): Promise<PublishedPage> {
  const headers = withAuth(token, { "Content-Type": "text/html" });
  if (options.name) headers["X-File-Name"] = encodeURIComponent(options.name);
  if (options.slug) headers["X-Slug"] = options.slug;

  const response = await fetch("/api/upload", { method: "POST", headers, body: html });
  return parse<PublishedPage>(response);
}

export async function listPages(token: string): Promise<PublishedPage[]> {
  const response = await fetch("/api/list", { headers: withAuth(token) });
  const data = await parse<ListResponse>(response);
  return data.pages;
}

export async function deletePage(id: string, token: string): Promise<void> {
  const response = await fetch(`/api/page/${id}`, { method: "DELETE", headers: withAuth(token) });
  await parse<{ ok: boolean }>(response);
}
