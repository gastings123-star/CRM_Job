import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { LocationProvider } from 'preact-iso';
import type { ComponentChildren } from 'preact';

vi.mock('@/infra/supabase', () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
  },
}));

import { employeesRepo, teamsRepo } from '@/infra/repos';
import { TeamsScreen } from '@/ui/screens/teams/TeamsScreen';
import { confirmSignal, toastsSignal } from '@/state/ui';
import type { Team, Employee } from '@/data/schema';

function Wrap({ children }: { children: ComponentChildren }): preact.JSX.Element {
  return <LocationProvider>{children}</LocationProvider>;
}

function team(id: string, name: string, color = '#534AB7'): Team {
  return { id, name, color };
}

function emp(team: string): Employee {
  return { id: Math.random().toString(36).slice(2), fullName: 'X', team } as unknown as Employee;
}

afterEach(() => {
  teamsRepo.signal.value = [];
  employeesRepo.signal.value = [];
  toastsSignal.value = [];
  confirmSignal.value = null;
  vi.restoreAllMocks();
});

describe('TeamsScreen', () => {
  it('пустой справочник → empty-state', () => {
    vi.spyOn(teamsRepo, 'loadAll').mockResolvedValue(undefined);
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    render(
      <Wrap>
        <TeamsScreen />
      </Wrap>,
    );
    expect(screen.getByText(/команд ещё нет/i)).not.toBeNull();
  });

  it('рисует строки команд и считает сотрудников', () => {
    vi.spyOn(teamsRepo, 'loadAll').mockResolvedValue(undefined);
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    teamsRepo.signal.value = [team('t1', 'EFS'), team('t2', 'Сити')];
    employeesRepo.signal.value = [emp('EFS'), emp('EFS'), emp('Сити'), emp('Незнакомая')];
    render(
      <Wrap>
        <TeamsScreen />
      </Wrap>,
    );
    expect(screen.getByText('EFS')).not.toBeNull();
    expect(screen.getByText('Сити')).not.toBeNull();
    // EFS — 2 человека, Сити — 1
    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    // в строке EFS число «2», в Сити — «1»
    expect(rows[0]?.textContent).toContain('2');
    expect(rows[1]?.textContent).toContain('1');
  });

  it('поиск фильтрует строки', async () => {
    vi.spyOn(teamsRepo, 'loadAll').mockResolvedValue(undefined);
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    teamsRepo.signal.value = [team('t1', 'EFS'), team('t2', 'Сити')];
    render(
      <Wrap>
        <TeamsScreen />
      </Wrap>,
    );
    const search = screen.getByPlaceholderText(/поиск/i);
    fireEvent.input(search, { target: { value: 'сити' } });
    await waitFor(() => {
      expect(screen.queryByText('EFS')).toBeNull();
    });
    expect(screen.queryByText('Сити')).not.toBeNull();
  });

  it('Add: открывает модалку, имя+цвет → teamsRepo.create', async () => {
    vi.spyOn(teamsRepo, 'loadAll').mockResolvedValue(undefined);
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    const create = vi.spyOn(teamsRepo, 'create').mockImplementation(() => undefined);
    render(
      <Wrap>
        <TeamsScreen />
      </Wrap>,
    );
    // кнопка в empty-state называется «+ Добавить команду»
    fireEvent.click(screen.getByRole('button', { name: /добавить команду/i }));
    const nameField = await screen.findByPlaceholderText(/ефс/i);
    fireEvent.input(nameField, { target: { value: 'Новая' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(create).toHaveBeenCalledTimes(1);
    const [created] = create.mock.calls[0]!;
    expect(created).toMatchObject({ name: 'Новая' });
  });
});
