import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { LocationProvider } from 'preact-iso';
import type { ComponentChildren } from 'preact';

vi.mock('@/infra/supabase', () => ({
  supabase: { from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) },
}));

import { employeesRepo, teamsRepo } from '@/infra/repos';
import { CrmScreen } from '@/ui/screens/crm/CrmScreen';
import { toastsSignal } from '@/state/ui';

function Wrap({ children }: { children: ComponentChildren }): preact.JSX.Element {
  return <LocationProvider>{children}</LocationProvider>;
}

function emp(id: string, fullName: string, team: string) {
  return { id, fullName, role: '', team, grade: 'Junior', email: '' } as never;
}

afterEach(() => {
  employeesRepo.signal.value = [];
  teamsRepo.signal.value = [];
  toastsSignal.value = [];
  vi.restoreAllMocks();
});

describe('CrmScreen — фильтр по команде', () => {
  it('select содержит все встречающиеся команды + «Без команды»', () => {
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    vi.spyOn(teamsRepo, 'loadAll').mockResolvedValue(undefined);
    employeesRepo.signal.value = [
      emp('1', 'Анна', 'EFS'),
      emp('2', 'Борис', 'EFS'),
      emp('3', 'Виктор', 'Сити'),
      emp('4', 'Дина', ''), // без команды
    ];
    render(
      <Wrap>
        <CrmScreen />
      </Wrap>,
    );
    const sel = screen.getByLabelText(/фильтр по команде/i);
    if (!(sel instanceof HTMLSelectElement)) throw new Error('Expected a team select');
    const options = Array.from(sel.options).map((o) => o.textContent ?? '');
    expect(options[0]).toMatch(/все команды · 4/i);
    expect(options.some((t) => /без команды · 1/i.test(t))).toBe(true);
    expect(options.some((t) => t.includes('EFS · 2'))).toBe(true);
    expect(options.some((t) => t.includes('Сити · 1'))).toBe(true);
  });

  it('выбор команды оставляет только её сотрудников в таблице', async () => {
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    vi.spyOn(teamsRepo, 'loadAll').mockResolvedValue(undefined);
    employeesRepo.signal.value = [emp('1', 'Анна', 'EFS'), emp('2', 'Виктор', 'Сити')];
    render(
      <Wrap>
        <CrmScreen />
      </Wrap>,
    );
    const sel = screen.getByLabelText(/фильтр по команде/i);
    fireEvent.change(sel, { target: { value: 'EFS' } });
    await waitFor(() => {
      expect(screen.queryByText('Виктор')).toBeNull();
    });
    expect(screen.queryByText('Анна')).not.toBeNull();
  });

  it('выбор «Без команды» оставляет только сотрудников без team', async () => {
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    vi.spyOn(teamsRepo, 'loadAll').mockResolvedValue(undefined);
    employeesRepo.signal.value = [emp('1', 'Анна', 'EFS'), emp('2', 'Бездомный', '')];
    render(
      <Wrap>
        <CrmScreen />
      </Wrap>,
    );
    const sel = screen.getByLabelText(/фильтр по команде/i);
    fireEvent.change(sel, { target: { value: '__none__' } });
    await waitFor(() => {
      expect(screen.queryByText('Анна')).toBeNull();
    });
    expect(screen.queryByText('Бездомный')).not.toBeNull();
  });
});
