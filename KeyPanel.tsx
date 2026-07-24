import { useEffect, useRef, useState } from "react";

interface Props {
  token: string;
  onSave: (token: string) => void;
}

/** Header control for the upload key. Opens a small inline field. */
export default function KeyPanel({ token, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(token);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  function save() {
    onSave(draft);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setDraft(token);
          setOpen((v) => !v);
        }}
        className={`rounded-sm border px-3 py-1.5 text-[11px] tracking-[0.14em] uppercase transition-colors ${
          token
            ? "border-blue text-blue hover:bg-blue-soft"
            : "border-line text-muted hover:border-ink hover:text-ink"
        }`}
      >
        {token ? "Key set" : "Set key"}
      </button>

      {open && (
        <div className="absolute top-full right-0 z-10 mt-2 w-[min(20rem,calc(100vw-2.5rem))] rounded-sm border border-ink bg-card p-3 shadow-[4px_4px_0_0_var(--color-line)]">
          <label htmlFor="key" className="block text-[10.5px] tracking-[0.18em] text-muted uppercase">
            Upload key
          </label>
          <input
            id="key"
            ref={input}
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="the AUTH_TOKEN secret"
            className="mt-2 w-full rounded-sm border border-line bg-paper px-2.5 py-2 text-[12.5px] focus:border-blue focus:outline-none"
          />
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={save}
              className="rounded-sm bg-ink px-3 py-2 text-[11px] tracking-[0.1em] text-paper uppercase hover:bg-blue"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-sm border border-line px-3 py-2 text-[11px] tracking-[0.1em] text-muted uppercase hover:border-ink hover:text-ink"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
            Stored in this browser only. It never leaves the page except as a header on your own uploads.
          </p>
        </div>
      )}
    </div>
  );
}
