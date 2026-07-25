import { useEffect, useRef, useState } from "react";
import type { User } from "../../shared/types";

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleAccounts {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }): void;
      renderButton(parent: HTMLElement, options: { theme: string; size: string; shape: string; text: string }): void;
      disableAutoSelect(): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

interface Props {
  clientId: string;
  user: User | null;
  busy: boolean;
  onCredential: (credential: string) => void;
  onLogout: () => void;
}

export default function AccountPanel({ clientId, user, busy, onCredential, onLogout }: Props) {
  const button = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!clientId || user) return;
    const existing = document.querySelector<HTMLScriptElement>("script[data-google-identity]");
    if (existing) {
      setScriptReady(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = () => setScriptReady(true);
    document.head.appendChild(script);
  }, [clientId, user]);

  useEffect(() => {
    if (!clientId || !scriptReady || !button.current || user || !window.google) return;
    button.current.innerHTML = "";
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) onCredential(response.credential);
      },
    });
    window.google.accounts.id.renderButton(button.current, {
      theme: "outline",
      size: "medium",
      shape: "rectangular",
      text: "signin_with",
    });
  }, [clientId, onCredential, scriptReady, user]);

  if (user) {
    return (
      <div className="flex items-center gap-2">
        {user.picture && (
          <img src={user.picture} alt="" className="h-7 w-7 rounded-full border border-line bg-card" />
        )}
        <div className="hidden max-w-[13rem] truncate text-right text-[11.5px] text-muted sm:block">
          {user.email}
        </div>
        <button
          type="button"
          onClick={() => {
            window.google?.accounts.id.disableAutoSelect();
            onLogout();
          }}
          className="rounded-sm border border-line px-3 py-1.5 text-[11px] tracking-[0.14em] text-muted uppercase hover:border-ink hover:text-ink"
        >
          Sign out
        </button>
      </div>
    );
  }

  if (!clientId) {
    return (
      <span className="rounded-sm border border-danger bg-danger-soft px-3 py-1.5 text-[11px] tracking-[0.08em] text-danger uppercase">
        Login off
      </span>
    );
  }

  return (
    <div
      className={`min-h-8 min-w-[10.5rem] transition-opacity ${busy ? "pointer-events-none opacity-60" : ""}`}
      ref={button}
    />
  );
}
