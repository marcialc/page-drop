import { useEffect, useState } from "react";
import { getMcpConnection, rotateMcpConnection } from "../lib/api";
import CopyButton from "./CopyButton";

const SECTION = "mt-11 border-t border-line pt-8 text-[11.5px] leading-relaxed text-muted";
const H = "mb-2.5 text-[10.5px] tracking-[0.2em] text-muted uppercase";
const SUB = "mt-5 mb-2 text-[10.5px] tracking-[0.16em] text-ink uppercase";
const CODE = "rounded-sm bg-line px-1.5 py-0.5 text-[12px] break-all text-ink";
const BTN =
  "rounded-sm border border-line px-2.5 py-1.5 text-[11px] tracking-[0.1em] text-muted uppercase hover:border-ink hover:text-ink disabled:opacity-50";
const COPIED = "border-ink! bg-acid! text-ink!";
const B = "font-bold text-ink";

/** What you paste into Claude Code to get the connector installed and tested. */
function setupPrompt(url: string): string {
  return [
    "Set up my PageDrop MCP server so you can publish HTML pages for me.",
    "",
    `Run: claude mcp add --transport http pagedrop "${url}"`,
    "",
    "Then list the pagedrop tools and publish a one-line test page to confirm it works.",
    "The key in that URL is my personal account credential — never write it into a file you commit.",
  ].join("\n");
}

export default function McpConnect() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let live = true;
    getMcpConnection()
      .then((mcp) => live && setUrl(mcp.url))
      .catch((err: unknown) =>
        live && setError(err instanceof Error ? err.message : "Could not load your MCP URL."),
      );
    return () => {
      live = false;
    };
  }, []);

  async function rotate() {
    if (!confirm("Generate a new MCP URL? Any connector using the old one stops working.")) return;
    setBusy(true);
    setError(null);
    try {
      setUrl((await rotateMcpConnection()).url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rotate your MCP key.");
    } finally {
      setBusy(false);
    }
  }

  // The key is a bearer credential in URL form, so keep it off screen by default.
  const shown = url && !revealed ? url.replace(/\/mcp\/.*/, "/mcp/••••••••••••") : url;

  return (
    <section className={SECTION}>
      <h3 className={H}>Connect Claude</h3>
      <p className="max-w-[54ch]">
        This URL is yours alone. Pages published through it land in the list above, on the account
        you are signed into right now. Anyone holding the URL can publish as you — treat it like a
        password, and rotate it if it leaks.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className={`${CODE} flex-1 min-w-[16ch]`}>{shown || "Loading…"}</code>
        <button type="button" className={BTN} onClick={() => setRevealed((v) => !v)} disabled={!url}>
          {revealed ? "Hide" : "Reveal"}
        </button>
      </div>

      {url && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CopyButton value={url} label="Copy URL" className={BTN} copiedClassName={COPIED} />
          <CopyButton
            value={setupPrompt(url)}
            label="Copy setup prompt"
            className={BTN}
            copiedClassName={COPIED}
          />
          <button type="button" className={BTN} onClick={rotate} disabled={busy}>
            {busy ? "Rotating…" : "Rotate key"}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 border-l-[3px] border-danger bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      <h4 className={SUB}>Claude app &amp; claude.ai</h4>
      <ol className="max-w-[54ch] list-decimal space-y-1.5 pl-4">
        <li>
          Hit <b className={B}>Copy URL</b> above.
        </li>
        <li>
          Open <b className={B}>Settings → Connectors → Add custom connector</b>.
        </li>
        <li>
          Paste the URL. Leave <b className={B}>Advanced settings</b> empty — the key is already in
          the URL, so there is no OAuth step and no token to fill in.
        </li>
        <li>
          <b className={B}>Add</b>, then enable PageDrop in a chat and ask Claude to publish a page.
        </li>
      </ol>

      <h4 className={SUB}>Claude Code</h4>
      <p className="max-w-[54ch]">
        Hit <b className={B}>Copy setup prompt</b> and paste it into Claude Code, or run it yourself:
      </p>
      <code className={`${CODE} mt-2 block`}>
        {`claude mcp add --transport http pagedrop "${shown || "…"}"`}
      </code>

      <h4 className={SUB}>ChatGPT</h4>
      <p className="max-w-[54ch]">
        <b className={B}>Settings → Apps &amp; Connectors → Create connector</b> (turn on Developer
        mode first if custom MCP is gated), paste the same URL, and leave authentication set to{" "}
        <b className={B}>No authentication</b>.
      </p>

      <h4 className={SUB}>Tools</h4>
      <ul className="max-w-[54ch] list-disc space-y-1 pl-4">
        <li>
          <code className={CODE}>publish_html</code> — html, optional name &amp; slug → public URL
        </li>
        <li>
          <code className={CODE}>list_pages</code> — your published pages
        </li>
        <li>
          <code className={CODE}>delete_page</code> — remove by id
        </li>
      </ul>
    </section>
  );
}
