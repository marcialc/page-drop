export interface Env {
  SITES: KVNamespace;
  ASSETS: Fetcher;
  /** Google OAuth web client id. Client ids are public, but config keeps deploys flexible. */
  GOOGLE_CLIENT_ID?: string;
  /** Optional legacy/admin key. Set with `wrangler secret put AUTH_TOKEN`. */
  AUTH_TOKEN?: string;
}
