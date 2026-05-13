import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';

vi.mock('@/infra/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() } },
}));

// auth.getSession() мочим: вернём «залогиненного» пользователя.
vi.mock('@/infra/auth', () => ({
  getSession: vi.fn(() => Promise.resolve({ user: { id: 'user-1' } })),
  signInWithMagicLink: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  onAuthChange: vi.fn(() => () => undefined),
}));

import { personalRepo } from '@/infra/repos';
import { PersonalScreen } from '@/ui/screens/personal/PersonalScreen';
import { toastsSignal } from '@/state/ui';

afterEach(() => {
  personalRepo.signal.value = null;
  toastsSignal.value = [];
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('PersonalScreen', () => {
  it('после загрузки рендерит секции «Заметки» и «Задачи»', async () => {
    vi.spyOn(personalRepo, 'loadFor').mockImplementation(() => {
      personalRepo.signal.value = null;
      return Promise.resolve();
    });
    render(<PersonalScreen />);
    expect(await screen.findByText('Заметки')).not.toBeNull();
    expect(screen.getByText('Задачи')).not.toBeNull();
    expect(screen.getByText(/задач пока нет/i)).not.toBeNull();
  });

  it('подставляет существующие notes и todos из репо', async () => {
    vi.spyOn(personalRepo, 'loadFor').mockImplementation(() => {
      personalRepo.signal.value = {
        notes: 'Купить хлеб',
        todos: [{ id: 't1', text: 'Сделать ревью', done: false, due: '2026-05-20' }],
      };
      return Promise.resolve();
    });
    render(<PersonalScreen />);
    expect(await screen.findByDisplayValue('Купить хлеб')).not.toBeNull();
    expect(screen.getByDisplayValue('Сделать ревью')).not.toBeNull();
  });

  it('добавление задачи через форму обновляет список', async () => {
    vi.spyOn(personalRepo, 'loadFor').mockResolvedValue(undefined);
    vi.spyOn(personalRepo, 'save').mockImplementation(() => undefined);
    render(<PersonalScreen />);
    const input = await screen.findByPlaceholderText(/что нужно сделать/i);
    fireEvent.input(input, { target: { value: 'Позвонить Маше' } });
    fireEvent.click(screen.getByRole('button', { name: /добавить/i }));
    await waitFor(() => {
      expect(screen.queryByDisplayValue('Позвонить Маше')).not.toBeNull();
    });
  });

  it('переключение чекбокса меняет статус задачи (зачёркивает текст)', async () => {
    vi.spyOn(personalRepo, 'loadFor').mockImplementation(() => {
      personalRepo.signal.value = {
        notes: '',
        todos: [{ id: 't1', text: 'Done me', done: false, due: '' }],
      };
      return Promise.resolve();
    });
    vi.spyOn(personalRepo, 'save').mockImplementation(() => undefined);
    render(<PersonalScreen />);
    const text = await screen.findByDisplayValue('Done me');
    if (!(text instanceof HTMLInputElement)) throw new Error('expected input');
    expect(text.className).not.toContain('line-through');
    const checkbox = screen.getByRole('checkbox', { name: /выполненной/i });
    fireEvent.click(checkbox);
    await waitFor(() => {
      const t = screen.getByDisplayValue('Done me');
      if (!(t instanceof HTMLInputElement)) throw new Error('expected input');
      expect(t.className).toContain('line-through');
    });
  });

  it('debounced auto-save вызывает personalRepo.save с обновлёнными данными', async () => {
    vi.useFakeTimers();
    const save = vi.spyOn(personalRepo, 'save').mockImplementation(() => undefined);
    vi.spyOn(personalRepo, 'loadFor').mockResolvedValue(undefined);
    render(<PersonalScreen />);
    // дождёмся, что loadFor зарезолвится и компонент отрендерился
    await vi.runAllTimersAsync();
    const input = screen.getByPlaceholderText(/что нужно сделать/i);
    fireEvent.input(input, { target: { value: 'Срочно' } });
    fireEvent.click(screen.getByRole('button', { name: /добавить/i }));
    // 800 мс debounce — продвигаем таймер
    await vi.advanceTimersByTimeAsync(900);
    expect(save).toHaveBeenCalled();
    const [uid, payload] = save.mock.calls[save.mock.calls.length - 1]!;
    expect(uid).toBe('user-1');
    expect(payload).toMatchObject({ todos: [expect.objectContaining({ text: 'Срочно' })] });
  });
});
