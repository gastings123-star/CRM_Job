import { act, cleanup, render, screen } from '@testing-library/preact';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  callback: null as ((session: Session | null) => void) | null,
  getSession: vi.fn<() => Promise<Session | null>>(),
  onAuthChange: vi.fn((callback: (session: Session | null) => void) => {
    auth.callback = callback;
    return () => undefined;
  }),
  signInWithGoogle: vi.fn(),
  signInWithMagicLink: vi.fn(),
}));

vi.mock('@/infra/auth', () => auth);
vi.mock('@/app/AppShell', () => ({
  AppShell: ({ session }: { session: Session }) => <div>Портал · {session.user.email}</div>,
}));

import { Shell } from '@/app/Shell';

const session = {
  user: { id: 'user-1', email: 'manager@example.com' },
} as unknown as Session;

describe('Shell — запуск авторизации', () => {
  beforeEach(() => {
    auth.callback = null;
    auth.getSession.mockReset();
    auth.onAuthChange.mockClear();
  });
  afterEach(cleanup);

  it('открывает портал по событию Supabase, даже если getSession завис', async () => {
    auth.getSession.mockReturnValue(new Promise(() => undefined));
    render(<Shell />);
    expect(screen.getByText('Загрузка…')).toBeTruthy();

    await act(() => auth.callback?.(session));

    expect(screen.getByText('Портал · manager@example.com')).toBeTruthy();
  });

  it('показывает восстановление вместо вечной загрузки при ошибке', async () => {
    auth.getSession.mockRejectedValue(new Error('Сессия недоступна'));
    render(<Shell />);

    expect((await screen.findByRole('alert')).textContent).toContain('Сессия недоступна');
    expect(screen.getByRole('button', { name: 'Повторить проверку' })).toBeTruthy();
  });
});
