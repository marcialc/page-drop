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

export interface ListResponse {
  pages: PublishedPage[];
}

export interface ErrorResponse {
  error: string;
}
