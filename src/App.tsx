import { useCallback, useEffect, useState } from "react";
import type { ConfigResponse, PublishedPage, User } from "../shared/types";
import AccountPanel from "./components/AccountPanel";
import DropZone from "./components/DropZone";
import LoginScreen from "./components/LoginScreen";
import PageList from "./components/PageList";
import Ticket from "./components/Ticket";
import { ApiError, deletePage, getConfig, getMe, listPages, loginWithGoogle, logout, uploadHtml } from "./lib/api";
import { formatBytes } from "./lib/format";

const DEFAULT_CONFIG: ConfigResponse = {
  googleClientId: "",
  limits: { maxUploadBytes: 20 * 1024 * 1024, maxPages: 100 },
};

export default function App() {
  const [config, setConfig] = useState<ConfigResponse>(DEFAULT_CONFIG);
  const [user, setUser] = useState<User | null>(null);
  const [pages, setPages] = useState<PublishedPage[]>([]);
  const [latest, setLatest] = useState<PublishedPage | null>(null);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listState, setListState] = useState<{ loading: boolean; message: string | null }>({
    loading: true,
    message: null,
  });

  const refresh = useCallback(async () => {
    if (!user) {
      setPages([]);
      setListState({ loading: false, message: "Sign in to see your published pages." });
      return;
    }
    setListState((s) => ({ ...s, loading: true }));
    try {
      setPages(await listPages());
      setListState({ loading: false, message: null });
    } catch (err) {
      setPages([]);
      setListState({
        loading: false,
        message:
          err instanceof ApiError && err.status === 401
            ? "Sign in to see your published pages."
            : err instanceof Error
              ? err.message
              : "Could not load your pages.",
      });
    }
  }, [user]);

  useEffect(() => {
    async function load() {
      try {
        const [nextConfig, nextUser] = await Promise.all([getConfig(), getMe()]);
        setConfig(nextConfig);
        setUser(nextUser);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load account.");
      }
    }
    void load();
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const publish = useCallback(
    async (html: string, name: string) => {
      if (!user) {
        setError("Sign in with Google to publish pages.");
        return;
      }
      if (!html.trim()) {
        setError("That file is empty.");
        return;
      }
      const size = new TextEncoder().encode(html).length;
      if (size > config.limits.maxUploadBytes) {
        setError(`That file is over the ${formatBytes(config.limits.maxUploadBytes)} limit.`);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const page = await uploadHtml(html, { name, slug: slug.trim() });
        setLatest(page);
        setSlug("");
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setBusy(false);
      }
    },
    [config.limits.maxUploadBytes, refresh, slug, user],
  );

  const publishFile = useCallback(
    async (file: File) => {
      if (file.size > config.limits.maxUploadBytes) {
        setError(`That file is over the ${formatBytes(config.limits.maxUploadBytes)} limit.`);
        return;
      }
      await publish(await file.text(), file.name);
    },
    [config.limits.maxUploadBytes, publish],
  );

  // ⌘V anywhere on the page publishes whatever HTML is on the clipboard.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (document.activeElement instanceof HTMLInputElement) return;
      const file = event.clipboardData?.files[0];
      if (file) {
        event.preventDefault();
        void publishFile(file);
        return;
      }
      const text = event.clipboardData?.getData("text") ?? "";
      if (/<[a-z!]/i.test(text)) {
        event.preventDefault();
        void publish(text, "pasted.html");
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [publish, publishFile]);

  async function remove(page: PublishedPage) {
    if (!confirm(`Delete ${page.id}? The link stops working.`)) return;
    try {
      await deletePage(page.id);
      if (latest?.id === page.id) setLatest(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  const signIn = useCallback(async (credential: string) => {
    setBusy(true);
    setError(null);
    try {
      setUser(await loginWithGoogle(credential));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google login failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await logout();
      setUser(null);
      setLatest(null);
      setPages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign out failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  if (!user) {
    return (
      <LoginScreen
        clientId={config.googleClientId}
        busy={busy}
        error={error}
        onCredential={signIn}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[760px] px-5 pt-7 pb-20">
      <header className="mb-7 flex items-center justify-between gap-4">
        <div className="text-[19px] font-bold tracking-[0.22em] uppercase">
          Page<span className="text-blue">Drop</span>
        </div>
        <AccountPanel
          clientId={config.googleClientId}
          user={user}
          busy={busy}
          onCredential={signIn}
          onLogout={signOut}
        />
      </header>

      <p className="mb-5.5 max-w-[46ch] text-[13px] text-muted">
        Put an HTML file in. Get a link out. Built for the single-file pages Claude and Codex hand
        you.
      </p>

      <DropZone busy={busy} disabled={!user} onFile={publishFile} onHtml={publish} />

      <div className="mt-3 flex items-center gap-2 text-[12px] text-muted">
        <label htmlFor="slug">Custom link</label>
        <input
          id="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="optional — e.g. pricing-demo"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-sm border border-line bg-card px-2.5 py-2 text-[12.5px] text-ink focus:border-blue focus:outline-none"
        />
      </div>

      {error && (
        <p className="mt-3.5 border-l-[3px] border-danger bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      {latest && <Ticket page={latest} />}

      <PageList
        pages={pages}
        loading={listState.loading}
        message={listState.message}
        pageLimit={config.limits.maxPages}
        onDelete={remove}
      />

      <footer className="mt-11 text-[11.5px] leading-loose text-muted">
        <b className="font-bold text-ink">Ship straight from the terminal:</b>
        <br />
        <code className="rounded-sm bg-line px-1.5 py-0.5 text-[12px] break-all">
          {`curl -X POST ${origin}/api/upload -H "Authorization: Bearer AUTH_TOKEN" -H "Content-Type: text/html" --data-binary @index.html`}
        </code>
      </footer>
    </div>
  );
}
