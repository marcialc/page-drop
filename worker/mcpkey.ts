import type { User } from "../shared/types";
import type { Env } from "./env";

/**
 * Per-user MCP keys. Connector UIs (claude.ai, ChatGPT) have no field for a
 * bearer token, so the credential has to travel in the URL itself. Each signed-in
 * user gets one long-lived, revocable key and pastes `/mcp/<key>` as the server URL.
 */

const KEY_PREFIX = "mcpkey:";
const USER_PREFIX = "user:";
/** Makes a leaked key obviously ours and cheap to recognise in logs. */
const TOKEN_PREFIX = "pd_";
const TOKEN_BYTES = 32;

export function mcpUrl(origin: string, key: string): string {
  return `${origin}/mcp/${key}`;
}

export async function getOrCreateMcpKey(env: Env, user: User): Promise<string> {
  const existing = await env.SITES.get(userKeyIndex(user.id));
  if (existing) return existing;
  return mintMcpKey(env, user);
}

/** Invalidates the old key immediately — any connector using it stops working. */
export async function rotateMcpKey(env: Env, user: User): Promise<string> {
  const existing = await env.SITES.get(userKeyIndex(user.id));
  if (existing) await env.SITES.delete(keyRecord(existing));
  return mintMcpKey(env, user);
}

export async function resolveMcpKey(env: Env, key: string): Promise<User | null> {
  if (!key.startsWith(TOKEN_PREFIX)) return null;
  const user = await env.SITES.get<User>(keyRecord(key), { type: "json" });
  return user && typeof user.id === "string" ? user : null;
}

async function mintMcpKey(env: Env, user: User): Promise<string> {
  const key = TOKEN_PREFIX + randomToken();
  await env.SITES.put(keyRecord(key), JSON.stringify(user));
  await env.SITES.put(userKeyIndex(user.id), key);
  return key;
}

function keyRecord(key: string): string {
  return `${KEY_PREFIX}${key}`;
}

function userKeyIndex(userId: string): string {
  return `${USER_PREFIX}${userId}:mcpkey`;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
