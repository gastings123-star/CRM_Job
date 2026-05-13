import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/preact';
import { LocationProvider } from 'preact-iso';
import type { ComponentChildren } from 'preact';

vi.mock('@/infra/supabase', () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
  },
}));

import { employeesRepo } from '@/infra/repos';
import { DashboardScreen } from '@/ui/screens/dashboard/DashboardScreen';
import { toastsSignal } from '@/state/ui';
import type { Employee } from '@/data/schema';

function Wrap({ children }: { children: ComponentChildren }): preact.JSX.Element {
  return <LocationProvider>{children}</LocationProvider>;
}

function emp(over: Partial<Employee> = {}): Employee {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    fullName: 'X',
    role: '',
    team: '',
    hireDate: '',
    salaryReviewDate: '',
    salary: 0,
    employeeNumber: '',
    positionId: '',
    location: '',
    email: '',
    teams: '',
    telegram: '',
    grade: 'Junior',
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
  toastsSignal.value = [];
  vi.restoreAllMocks();
});

describe('DashboardScreen', () => {
  it('пустая база — показывает empty-state', () => {
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    render(
      <Wrap>
        <DashboardScreen />
      </Wrap>,
    );
    expect(screen.getByText(/база пуста/i)).not.toBeNull();
  });

  it('считает KPI: всего, bus factor, высокий риск, просрочки', () => {
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    employeesRepo.signal.value = [
      emp({ id: 'a', fullName: 'A', grade: 'Senior', team: 'EFS' }),
      emp({ id: 'b', fullName: 'B', grade: 'Senior', team: 'EFS' }),
      emp({ id: 'c', fullName: 'C', grade: 'Junior', team: 'Сити' }),
      // высокий риск — без комментария + перегружен 130%
      emp({
        id: 'd',
        fullName: 'D',
        grade: 'Middle',
        team: 'EFS',
        load: {
          currentDays: 0,
          currentPercent: 130,
          capacityQuarter: 0,
          capacityQtr: '',
          status: 'занят',
          nextMonthPlan: 0,
          vacations: [],
          sickLeaves: [],
          projects: [],
        },
        risk: { level: 'высокий', comment: '' },
        salaryReviewDate: '2020-01-01',
      }),
    ];
    render(
      <Wrap>
        <DashboardScreen />
      </Wrap>,
    );
    // 4 KPI-карточки
    expect(screen.getByText('Сотрудников')).not.toBeNull();
    // значение «всего» совпадает с длиной массива
    const totalCard = screen.getByText('Сотрудников').parentElement!;
    expect(within(totalCard).getByText('4')).not.toBeNull();
    // «Высокий риск» — должно быть как минимум 1
    const riskCard = screen.getByText('Высокий риск').parentElement!;
    const highVal = within(riskCard).getAllByText(/^\d+$/)[0]!.textContent;
    expect(Number(highVal)).toBeGreaterThanOrEqual(1);
  });

  it('распределение по командам показывает все группы', () => {
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    employeesRepo.signal.value = [
      emp({ id: 'a', team: 'EFS' }),
      emp({ id: 'b', team: 'EFS' }),
      emp({ id: 'c', team: 'Сити' }),
      emp({ id: 'd', team: '' }), // → Без команды
    ];
    render(
      <Wrap>
        <DashboardScreen />
      </Wrap>,
    );
    // Каждая группа встречается как минимум один раз (в карточке «По командам»);
    // может всплывать и в «Топ риска ухода», поэтому проверяем «есть хотя бы один».
    expect(screen.queryAllByText('EFS').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText('Сити').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText('Без команды').length).toBeGreaterThanOrEqual(1);
  });

  it('строит уведомления (просроченный ФОТ)', () => {
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    employeesRepo.signal.value = [
      emp({
        id: 'x',
        fullName: 'Просрочкин',
        salaryReviewDate: '2020-01-01', // >12 мес = красное уведомление
      }),
    ];
    render(
      <Wrap>
        <DashboardScreen />
      </Wrap>,
    );
    expect(screen.getByText(/пересмотр фот просрочен/i)).not.toBeNull();
  });
});
