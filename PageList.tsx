import type { PublishedPage } from "../../shared/types";
import { formatAgo, formatBytes } from "../lib/format";
import CopyButton from "./CopyButton";

const MINI = "px-1.5 py-1 text-[11px] tracking-[0.08em] uppercase text-muted hover:text-blue";

interface Props {
  pages: PublishedPage[];
  loading: boolean;
  message: string | null;
  onDelete: (page: PublishedPage) => void;
}

export default function PageList({ pages, loading, message, onDelete }: Props) {
  return (
    <section>
      <h3 className="mt-11 mb-2.5 flex items-baseline justify-between border-b border-line pb-2 text-[10.5px] tracking-[0.2em] text-muted uppercase">
        <span>Published</span>
        <span>{pages.length ? `${pages.length} ${pages.length === 1 ? "page" : "pages"}` : ""}</span>
      </h3>

      {message ? (
        <p className="px-0.5 py-6 text-[12.5px] text-muted">{message}</p>
      ) : loading ? (
        <p className="px-0.5 py-6 text-[12.5px] text-muted">Loading…</p>
      ) : pages.length === 0 ? (
        <p className="px-0.5 py-6 text-[12.5px] text-muted">
          Nothing published yet. Your first link shows up here.
        </p>
      ) : (
        <ul>
          {pages.map((page) => (
            <li key={page.id} className="flex items-center gap-3 border-b border-line px-0.5 py-2.5">
              <a
                href={page.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] font-bold hover:text-blue"
              >
                {page.id}
              </a>
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">
                {[page.name, formatBytes(page.size), formatAgo(page.created)]
                  .filter(Boolean)
                  .join("  ·  ")}
              </span>
              <CopyButton value={page.url} label="Copy" className={MINI} />
              <a href={page.download} className={MINI}>
                Get
              </a>
              <button
                type="button"
                onClick={() => onDelete(page)}
                className={`${MINI} hover:text-danger!`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
