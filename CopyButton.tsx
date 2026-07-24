import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  label?: string;
  className?: string;
  copiedClassName?: string;
}

/** Copies `value` and swaps its label for a beat. */
export default function CopyButton({
  value,
  label = "Copy link",
  className = "",
  copiedClassName = "",
}: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`${className} ${copied ? copiedClassName : ""}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
