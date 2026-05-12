import { useEffect, useState } from 'preact/hooks';
import {
  getSession,
  onAuthChange,
  signInWithGoogle,
  signInWithMagicLink,
} from '@/infra/auth';
import type { Session } from '@supabase/supabase-js';
import { AppShell } from './AppShell';
import { Button } from '@/ui/components/Button';
import { Field, TextInput } from '@/ui/components/Field';

/**
 * Корневой компонент: до получения сессии — спиннер; без сессии — экран входа;
 * с сессией — `AppShell` с роутингом и навигацией.
 */
export function Shell() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getSession().then((s) => {
      setSession(s);
      setLoading(false);
    });
    return onAuthChange((s) => setSession(s));
  }, []);

  if (loading) {
    return (
      <div class="flex min-h-screen items-center justify-center text-slate-400">Загрузка…</div>
    );
  }
  if (!session) return <SignIn />;
  return <AppShell session={session} />;
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
    <div class="flex min-h-screen items-center justify-center">
      <div class="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur">
        <h1 class="mb-4 text-2xl font-semibold">Staff CRM</h1>
        {linkSent ? (
          <p class="text-slate-300">
            Ссылка отправлена на <strong>{email}</strong>. Открой её, чтобы войти.
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void handleGoogle()}
              disabled={busy !== null}
              class="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-60"
            >
              <GoogleIcon />
              {busy === 'google' ? 'Перенаправляем…' : 'Войти через Google'}
            </button>
            <div class="my-4 flex items-center gap-3 text-xs text-slate-500">
              <span class="h-px flex-1 bg-white/10" />
              или
              <span class="h-px flex-1 bg-white/10" />
            </div>
            <form onSubmit={handleMagicLink} class="space-y-3">
              <Field label="Email" required>
                {(p) => (
                  <TextInput
                    {...p}
                    type="email"
                    required
                    value={email}
                    onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                    placeholder="you@example.com"
                  />
                )}
              </Field>
              <Button type="submit" disabled={busy !== null} class="w-full">
                {busy === 'magic' ? 'Отправляем…' : 'Прислать ссылку'}
              </Button>
            </form>
          </>
        )}
        {authError && <p class="mt-3 text-sm text-red-400">{authError}</p>}
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
