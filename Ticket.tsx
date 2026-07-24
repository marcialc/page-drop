import type { PublishedPage } from "../../shared/types";
import { formatBytes } from "../lib/format";
import CopyButton from "./CopyButton";

const ACTION =
  "rounded-sm border px-3.5 py-2.5 text-[11.5px] tracking-[0.1em] uppercase transition-colors";
const SOLID = `${ACTION} border-ink bg-ink text-paper hover:border-blue hover:bg-blue hover:text-white`;
const GHOST = `${ACTION} border-ink bg-transparent text-ink hover:border-blue hover:bg-blue hover:text-white`;

interface Props {
  page: PublishedPage;
}

/** A tear-off stub: the id printed large, perforation, then the link. */
export default function Ticket({ page }: Props) {
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="mt-6 animate-tear overflow-hidden rounded-sm border border-ink bg-card motion-reduce:animate-none">
      <div className="bg-blue px-5.5 pt-5 pb-4.5 text-white">
        <div className="text-[10.5px] tracking-[0.2em] uppercase opacity-75">Live</div>
        <div className="mt-1 text-[40px] leading-tight font-bold tracking-[-0.03em] max-sm:text-[32px]">
          {page.id}
        </div>
        <div className="mt-0.5 text-[12px] break-all opacity-80">
          {page.name || "untitled.html"}
          {page.size ? ` · ${formatBytes(page.size)}` : ""}
        </div>
      </div>

      {/* perforation */}
      <div className="relative h-0 border-t-2 border-dashed border-line before:absolute before:-top-[9px] before:-left-[9px] before:h-4 before:w-4 before:rounded-full before:border before:border-ink before:bg-paper before:[clip-path:inset(0_0_0_50%)] before:content-[''] after:absolute after:-top-[9px] after:-right-[9px] after:h-4 after:w-4 after:rounded-full after:border after:border-ink after:bg-paper after:[clip-path:inset(0_50%_0_0)] after:content-['']" />

      <div className="px-5.5 pt-4 pb-4.5">
        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 block rounded-sm bg-blue-soft px-2.5 py-2.5 text-[13px] break-all text-blue hover:underline"
        >
          {page.url}
        </a>

        <div className="flex flex-wrap gap-1.5">
          <CopyButton
            value={page.url}
            className={SOLID}
            copiedClassName="border-ink! bg-acid! text-ink!"
          />
          <a href={page.url} target="_blank" rel="noopener noreferrer" className={GHOST}>
            Open
          </a>
          <a href={page.download} className={GHOST}>
            Download
          </a>
          {canShare && (
            <button
              type="button"
              className={GHOST}
              onClick={() => navigator.share({ title: page.name || page.id, url: page.url })}
            >
              Share
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
