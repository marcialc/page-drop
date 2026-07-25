import AccountPanel from "./AccountPanel";

interface Props {
  clientId: string;
  busy: boolean;
  error: string | null;
  onCredential: (credential: string) => void;
}

/** The stub you get before the ticket: same perforated card, printed in ink instead of blue. */
export default function LoginScreen({ clientId, busy, error, onCredential }: Props) {
  return (
    <main className="login-grid grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-[25rem] animate-tear motion-reduce:animate-none">
        <div className="overflow-hidden rounded-sm border border-ink bg-card shadow-[0_18px_44px_rgba(20,22,26,0.09)]">
          <div className="bg-ink px-5.5 pt-5 pb-4.5 text-paper">
            <div className="text-[10.5px] tracking-[0.22em] uppercase opacity-65">PageDrop</div>
            <div className="mt-1 text-[34px] leading-tight font-bold tracking-[-0.03em] max-sm:text-[28px]">
              Sign in
            </div>
            <div className="mt-0.5 text-[12px] opacity-75">An .html file in. A link out.</div>
          </div>

          {/* perforation */}
          <div className="relative h-0 border-t-2 border-dashed border-line before:absolute before:-top-[9px] before:-left-[9px] before:h-4 before:w-4 before:rounded-full before:border before:border-ink before:bg-paper before:[clip-path:inset(0_0_0_50%)] before:content-[''] after:absolute after:-top-[9px] after:-right-[9px] after:h-4 after:w-4 after:rounded-full after:border after:border-ink after:bg-paper after:[clip-path:inset(0_50%_0_0)] after:content-['']" />

          <div className="px-5.5 pt-5 pb-5">
            <p className="text-[12.5px] leading-relaxed text-muted">
              Your account keeps every page you publish in one list, with the links that point at
              them.
            </p>

            <div className="mt-4.5 grid min-h-[4.25rem] place-items-center rounded-sm border-[1.5px] border-dashed border-line bg-paper px-4 py-4">
              <AccountPanel
                clientId={clientId}
                user={null}
                busy={busy}
                onCredential={onCredential}
                onLogout={() => undefined}
              />
            </div>

            {error && (
              <p className="mt-3.5 border-l-[3px] border-danger bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger">
                {error}
              </p>
            )}

            <div className="mt-5 flex items-baseline justify-between border-t border-line pt-2.5 text-[10.5px] tracking-[0.2em] text-muted uppercase">
              <span>20 MB / file</span>
              <span>100 pages</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
