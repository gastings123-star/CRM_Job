import { useEffect, useState } from 'preact/hooks';
import { getSession, signInWithMagicLink, signOut } from '@/infra/auth';
import type { Session } from '@supabase/supabase-js';

export function Shell() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    void getSession().then((s) => {
      setSession(s);
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setAuthError(null);
    try {
      await signInWithMagicLink(email);
      setLinkSent(true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">Загрузка…</div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur">
          <h1 className="mb-4 text-2xl font-semibold">Backlog Tracker</h1>
          {linkSent ? (
            <p className="text-slate-300">
              Ссылка отправлена на <strong>{email}</strong>. Проверь почту и открой ссылку, чтобы войти.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-slate-400">Введи email — пришлём ссылку для входа.</p>
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
                className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500"
              >
                Прислать ссылку
              </button>
              {authError && <p className="text-sm text-red-400">{authError}</p>}
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-white/5 px-6 py-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Backlog Tracker</h1>
          <div className="flex items-center gap-4">
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
        <p className="text-slate-400">v2 в разработке. Этап 0 завершён — каркас готов.</p>
      </main>
    </div>
  );
}
