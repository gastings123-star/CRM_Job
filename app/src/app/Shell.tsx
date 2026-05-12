import { useEffect, useState } from 'preact/hooks';
import {
  getSession,
  onAuthChange,
  signInWithGoogle,
  signInWithMagicLink,
  signOut,
} from '@/infra/auth';
import { syncQueue, type SyncStatus } from '@/infra/sync';
import type { Session } from '@supabase/supabase-js';

export function Shell() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getSession().then((s) => {
      setSession(s);
      setLoading(false);
    });
    const off = onAuthChange((s) => setSession(s));
    return off;
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">Загрузка…</div>
    );
  }

  if (!session) return <SignIn />;
  return <AuthedApp session={session} />;
}

// ---------------------------------------------------------------
// SignIn
// ---------------------------------------------------------------

function SignIn() {
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'google' | 'magic' | null>(null);

  async function handleMagicLink(e: Event) {
    e.preventDefault();
    setAuthError(null);
    setBusy('magic');
    try {
      await signInWithMagicLink(email);
      setLinkSent(true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleGoogle() {
    setAuthError(null);
    setBusy('google');
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur">
        <h1 className="mb-4 text-2xl font-semibold">Staff CRM</h1>
        {linkSent ? (
          <p className="text-slate-300">
            Ссылка отправлена на <strong>{email}</strong>. Открой её, чтобы войти.
          </p>
        ) : (
          <>
            <button
              onClick={() => void handleGoogle()}
              disabled={busy !== null}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-60"
            >
              <GoogleIcon />
              {busy === 'google' ? 'Перенаправляем…' : 'Войти через Google'}
            </button>
            <div className="my-4 flex items-center gap-3 text-xs text-slate-500">
              <span className="h-px flex-1 bg-white/10" />
              или
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <form onSubmit={handleMagicLink} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={busy !== null}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500 disabled:opacity-60"
              >
                {busy === 'magic' ? 'Отправляем…' : 'Прислать ссылку'}
              </button>
            </form>
          </>
        )}
        {authError && <p className="mt-3 text-sm text-red-400">{authError}</p>}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.5 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.9c-.26 1.37-1.04 2.53-2.21 3.31v2.74h3.57c2.09-1.93 3.24-4.77 3.24-8.08z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.74c-.99.66-2.26 1.06-3.71 1.06-2.85 0-5.27-1.93-6.13-4.52H2.18v2.84A10.99 10.99 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.87 14.15a6.6 6.6 0 0 1 0-4.3V7.01H2.18a11 11 0 0 0 0 9.98l3.69-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.45 2.1 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.01l3.69 2.84C6.73 7.31 9.15 5.38 12 5.38z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------
// Authed
// ---------------------------------------------------------------

function AuthedApp({ session }: { session: Session }) {
  const [sync, setSync] = useState<SyncStatus>(syncQueue.getStatus());

  useEffect(() => {
    syncQueue.start();
    const off = syncQueue.subscribe(setSync);
    return () => {
      off();
      syncQueue.stop();
    };
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-white/5 px-6 py-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Staff CRM</h1>
          <div className="flex items-center gap-4">
            <SyncBadge status={sync} />
            <span className="text-sm text-slate-400">{session.user.email}</span>
            <button
              onClick={() => void signOut()}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/10"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>
      <main className="p-6">
        <p className="text-slate-400">
          v2 в разработке. Этап 2 — инфраструктура: storage, sync, import/export, OAuth.
        </p>
      </main>
    </div>
  );
}

function SyncBadge({ status }: { status: SyncStatus }) {
  const color = !status.online
    ? 'bg-amber-500/20 text-amber-300'
    : status.pending > 0
      ? 'bg-blue-500/20 text-blue-300'
      : 'bg-emerald-500/20 text-emerald-300';
  const label = !status.online
    ? 'Офлайн'
    : status.pending > 0
      ? `Синхронизация… ${status.pending}`
      : 'Синхронизировано';
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs ${color}`}
      title={status.lastError ?? undefined}
    >
      {label}
    </span>
  );
}
