/** Shape returned by the API for every published page. Used by both sides. */
export interface PublishedPage {
  id: string;
  name: string;
  size: number;
  /** Epoch milliseconds. */
  created: number;
  url: string;
  raw: string;
  download: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export interface Limits {
  maxUploadBytes: number;
  maxPages: number;
}

export interface ConfigResponse {
  googleClientId: string;
  limits: Limits;
}

export interface MeResponse {
  user: User | null;
}

export interface ListResponse {
  pages: PublishedPage[];
}

export interface ErrorResponse {
  error: string;
}
