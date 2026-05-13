import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { LocationProvider } from 'preact-iso';
import type { ComponentChildren } from 'preact';

vi.mock('@/infra/supabase', () => ({
  supabase: { from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) },
}));

import { employeesRepo, teamsRepo } from '@/infra/repos';
import { CrmScreen } from '@/ui/screens/crm/CrmScreen';
import { confirmSignal, resolveConfirm, toastsSignal } from '@/state/ui';
import type { Employee } from '@/data/schema';

function Wrap({ children }: { children: ComponentChildren }): preact.JSX.Element {
  return <LocationProvider>{children}</LocationProvider>;
}

function emp(id: string, fullName: string, over: Partial<Employee> = {}): Employee {
  return {
    id,
    fullName,
    role: '',
    team: '',
    grade: 'Junior',
    email: '',
    hireDate: '',
    salaryReviewDate: '',
    salary: 0,
    employeeNumber: '',
    positionId: '',
    location: '',
    teams: '',
    telegram: '',
    birthday: '',
    load: {
      currentDays: 0,
      currentPercent: 0,
      capacityQuarter: 0,
      capacityQtr: '',
      status: 'доступен',
      nextMonthPlan: 0,
      vacations: [],
      sickLeaves: [],
      projects: [],
    },
    skills: [],
    development: [],
    managerRating: { score: 3, comment: '' },
    projectHistory: [],
    salaryHistory: [],
    hobbies: '',
    managerComments: [],
    documents: [],
    risk: { level: 'низкий', comment: '' },
    promotionReadiness: 'не готов',
    workPreference: 'гибрид',
    tasks: [],
    oneOnOne: {
      nextDate: '',
      prepNotes: '',
      history: [],
      agendaChecklist: {
        feedback: false,
        goals: false,
        load: false,
        growth: false,
        wellbeing: false,
      },
      agendaExtra: '',
    },
    goalsCurrentPeriod: '',
    goals: [],
    goalsSummary: { score: 3, comment: '', date: '' },
    teamHistory: [],
    ...over,
  } as unknown as Employee;
}

afterEach(() => {
  employeesRepo.signal.value = [];
  teamsRepo.signal.value = [];
  toastsSignal.value = [];
  confirmSignal.value = null;
  vi.restoreAllMocks();
});

describe('CrmScreen bulk actions', () => {
  it('панель массовых действий не показана без выбранных строк', () => {
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    employeesRepo.signal.value = [emp('1', 'Анна'), emp('2', 'Борис')];
    render(
      <Wrap>
        <CrmScreen />
      </Wrap>,
    );
    expect(screen.queryByRole('region', { name: /массовые действия/i })).toBeNull();
  });

  it('выделение строки показывает панель и счётчик', () => {
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    employeesRepo.signal.value = [emp('1', 'Анна'), emp('2', 'Борис')];
    render(
      <Wrap>
        <CrmScreen />
      </Wrap>,
    );
    const anna = screen.getByRole('checkbox', { name: /выбрать анна/i });
    fireEvent.click(anna);
    expect(screen.getByRole('region', { name: /массовые действия/i })).not.toBeNull();
    expect(screen.getByText(/выбрано: 1/i)).not.toBeNull();
  });

  it('master-checkbox выбирает все видимые', () => {
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    employeesRepo.signal.value = [emp('1', 'Анна'), emp('2', 'Борис'), emp('3', 'Виктор')];
    render(
      <Wrap>
        <CrmScreen />
      </Wrap>,
    );
    const master = screen.getByRole('checkbox', { name: /выбрать все/i });
    fireEvent.click(master);
    expect(screen.getByText(/выбрано: 3/i)).not.toBeNull();
  });

  it('bulk grade: обновляет всех выбранных через repo.update', async () => {
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    employeesRepo.signal.value = [emp('1', 'Анна'), emp('2', 'Борис')];
    render(
      <Wrap>
        <CrmScreen />
      </Wrap>,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /выбрать все/i }));
    fireEvent.click(screen.getByRole('button', { name: /грейд…/i }));
    // Выбираем Senior в селекте модалки
    const selects = document.querySelectorAll('select');
    const gradeSelect = selects[selects.length - 1] as HTMLSelectElement;
    fireEvent.change(gradeSelect, { target: { value: 'Senior' } });
    fireEvent.click(screen.getByRole('button', { name: /применить/i }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledTimes(2);
    });
    expect(update.mock.calls[0]?.[1]).toMatchObject({ grade: 'Senior' });
    expect(update.mock.calls[1]?.[1]).toMatchObject({ grade: 'Senior' });
  });

  it('bulk delete: confirm + удаление через repo.remove', async () => {
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    const remove = vi.spyOn(employeesRepo, 'remove').mockImplementation(() => undefined);
    employeesRepo.signal.value = [emp('1', 'Анна'), emp('2', 'Борис')];
    render(
      <Wrap>
        <CrmScreen />
      </Wrap>,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /выбрать все/i }));
    // Кнопка «Удалить» внутри bulk-панели (одна на регион, в отличие от рядовых ×)
    const bar = screen.getByRole('region', { name: /массовые действия/i });
    const delBtn = Array.from(bar.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Удалить',
    );
    if (!delBtn) throw new Error('Bulk delete button not found');
    fireEvent.click(delBtn);
    await waitFor(() => {
      expect(confirmSignal.value).not.toBeNull();
    });
    resolveConfirm(true);
    await waitFor(() => {
      expect(remove).toHaveBeenCalledTimes(2);
    });
  });
});
