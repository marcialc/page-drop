interface Props {
  origin: string;
}

const CODE = "rounded-sm bg-line px-1.5 py-0.5 text-[12px] break-all text-ink";
const SECTION = "mt-9 text-[11.5px] leading-relaxed text-muted";
const H = "mb-2.5 text-[10.5px] tracking-[0.2em] text-muted uppercase";

export default function Footer({ origin }: Props) {
  return (
    <footer className={SECTION}>
      <h3 className={H}>Ship from the terminal</h3>
      <p className="mb-2 max-w-[54ch]">
        The REST endpoints take the shared <code className={CODE}>AUTH_TOKEN</code> you set with{" "}
        <code className={CODE}>wrangler secret put AUTH_TOKEN</code>. Unlike your MCP URL, those
        uploads are owned by the admin account.
      </p>
      <code className={`${CODE} block`}>
        {`curl -X POST ${origin}/api/upload -H "Authorization: Bearer AUTH_TOKEN" -H "Content-Type: text/html" --data-binary @index.html`}
      </code>
    </footer>
  );
}
