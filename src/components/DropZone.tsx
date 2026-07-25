import { useRef, useState, type DragEvent } from "react";

interface Props {
  busy: boolean;
  disabled?: boolean;
  onFile: (file: File) => void;
  onHtml: (html: string, name: string) => void;
}

export default function DropZone({ busy, disabled = false, onFile, onHtml }: Props) {
  const [hot, setHot] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0); // dragenter/leave fire on children too

  function enter(e: DragEvent) {
    e.preventDefault();
    depth.current += 1;
    setHot(true);
  }

  function leave(e: DragEvent) {
    e.preventDefault();
    depth.current -= 1;
    if (depth.current <= 0) setHot(false);
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    depth.current = 0;
    setHot(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      onFile(file);
      return;
    }
    const text = e.dataTransfer.getData("text/html") || e.dataTransfer.getData("text/plain");
    if (text) onHtml(text, "pasted.html");
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Choose an HTML file to publish"
      aria-busy={busy}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) input.current?.click();
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragEnter={enter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={leave}
      onDrop={drop}
      className={`cursor-pointer rounded-sm border-[1.5px] px-6 py-13 text-center transition-colors ${
        hot ? "border-solid border-blue bg-blue-soft" : "border-dashed border-line bg-card hover:border-muted"
      } ${busy || disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      <h2 className="text-[17px] font-bold tracking-tight">
        {busy ? "Publishing…" : disabled ? "Sign in to publish" : "Drop an .html file here"}
      </h2>
      <p className="mt-1.5 text-[12.5px] text-muted">
        up to 20 MB · 100 pages max
      </p>
      <input
        ref={input}
        type="file"
        accept=".html,.htm,text/html"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
