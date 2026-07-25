/** Domain error that REST maps to status codes and MCP surfaces as tool errors. */
export class PageError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PageError";
    this.status = status;
  }
}
