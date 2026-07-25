import CopyButton from "./CopyButton";

interface Props {
  origin: string;
}

const CODE =
  "rounded-sm bg-line px-1.5 py-0.5 text-[12px] break-all text-ink";
const SECTION =
  "mt-11 border-t border-line pt-8 text-[11.5px] leading-relaxed text-muted";
const H =
  "mb-2.5 text-[10.5px] tracking-[0.2em] text-muted uppercase";
const SUB =
  "mt-5 mb-2 text-[10.5px] tracking-[0.16em] text-ink uppercase";

export default function Footer({ origin }: Props) {
  const mcpUrl = `${origin}/mcp`;

  return (
    <footer className={SECTION}>
      <h3 className={H}>Connect with MCP</h3>
      <p className="max-w-[52ch]">
        Claude and ChatGPT can publish HTML here as a remote MCP connector. Use the same{" "}
        <code className={CODE}>AUTH_TOKEN</code> you set with{" "}
        <code className={CODE}>wrangler secret put AUTH_TOKEN</code>. Auth is a Bearer header —
        not your Google session.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className={`${CODE} flex-1`}>{mcpUrl}</code>
        <CopyButton
          value={mcpUrl}
          label="Copy URL"
          className="rounded-sm border border-line px-2.5 py-1.5 text-[11px] tracking-[0.1em] text-muted uppercase hover:border-ink hover:text-ink"
          copiedClassName="border-ink! bg-acid! text-ink!"
        />
      </div>

      <h4 className={SUB}>Claude</h4>
      <ol className="list-decimal space-y-1.5 pl-4 max-w-[54ch]">
        <li>
          Open <b className="font-bold text-ink">Settings → Connectors</b> (or Customize →
          Connectors).
        </li>
        <li>
          <b className="font-bold text-ink">Add custom connector</b> → Web / remote MCP.
        </li>
        <li>
          Server URL: <code className={CODE}>{mcpUrl}</code>
        </li>
        <li>
          Authentication: Bearer token = your <code className={CODE}>AUTH_TOKEN</code> value.
        </li>
        <li>
          Enable the connector in a chat, then ask Claude to publish HTML and return the link.
        </li>
      </ol>

      <h4 className={SUB}>ChatGPT</h4>
      <ol className="list-decimal space-y-1.5 pl-4 max-w-[54ch]">
        <li>
          Open <b className="font-bold text-ink">Settings → Apps &amp; Connectors</b> (wording
          varies by plan).
        </li>
        <li>
          Turn on <b className="font-bold text-ink">Developer mode</b> under Advanced settings if
          custom MCP is gated.
        </li>
        <li>
          <b className="font-bold text-ink">Create connector</b> → paste the MCP URL above.
        </li>
        <li>
          Auth: Bearer / API key = your <code className={CODE}>AUTH_TOKEN</code>.
        </li>
        <li>
          In a chat, enable the connector and ask ChatGPT to publish a page via PageDrop.
        </li>
      </ol>
      <p className="mt-2 max-w-[52ch]">
        MCP connectors need a plan that supports custom remote MCP (often Pro / Plus / Business with
        Developer mode). If the UI only offers Custom GPT Actions, use the REST{" "}
        <code className={CODE}>/api/*</code> endpoints instead.
      </p>

      <h4 className={SUB}>Tools</h4>
      <ul className="list-disc space-y-1 pl-4 max-w-[52ch]">
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
      <p className="mt-2 max-w-[52ch]">
        Token traffic is owned as the <b className="font-bold text-ink">admin</b> account (shared
        AUTH_TOKEN pool), separate from Google-signed-in pages in this UI.
      </p>

      <h4 className={SUB}>Terminal</h4>
      <code className={`${CODE} block`}>
        {`curl -X POST ${origin}/api/upload -H "Authorization: Bearer AUTH_TOKEN" -H "Content-Type: text/html" --data-binary @index.html`}
      </code>
    </footer>
  );
}
