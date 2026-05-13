import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';

vi.mock('@/infra/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { employeesRepo } from '@/infra/repos';
import { ProjectHistoryTab } from '@/ui/screens/crm/tabs/ProjectHistoryTab';
import { ExtraTab } from '@/ui/screens/crm/tabs/ExtraTab';
import { toastsSignal } from '@/state/ui';
import type { Employee } from '@/data/schema';

function sampleEmployee(overrides: Partial<Employee> = {}): Employee {
  const base = {
    id: 'e1',
    fullName: 'Иван Иванов',
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
    development: [
      { zone: 'System Design', status: 'в работе', deadline: '2026-06-01' },
    ],
    managerRating: { score: 3, comment: '' },
    projectHistory: [
      {
        name: 'Личный кабинет',
        role: 'Тимлид',
        from: '2024-01-01',
        to: '',
        achievements: 'Запуск MVP',
      },
      {
        name: 'Платёжный шлюз',
        role: 'Старший разработчик',
        from: '2022-01-01',
        to: '2023-12-31',
        achievements: '',
      },
    ],
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
    teamHistory: [{ date: '2024-06-01', from: 'ЕФС', to: 'Сити+', comment: '' }],
  } as unknown as Employee;
  return { ...base, ...overrides };
}

afterEach(() => {
  toastsSignal.value = [];
  vi.restoreAllMocks();
});

describe('ProjectHistoryTab', () => {
  it('рендерит проекты, «текущий» (пустое to) — сверху', () => {
    render(<ProjectHistoryTab employee={sampleEmployee()} />);
    const nameInputs = document.querySelectorAll<HTMLInputElement>(
      'input[placeholder^="Например"]',
    );
    expect(nameInputs[0]?.value).toBe('Личный кабинет');
    expect(nameInputs[1]?.value).toBe('Платёжный шлюз');
  });

  it('Сохранить отдаёт triммированный массив без записей с пустым name', () => {
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    render(<ProjectHistoryTab employee={sampleEmployee()} />);
    // добавляем пустую запись — она должна отфильтроваться
    fireEvent.click(screen.getByRole('button', { name: /добавить/i }));
    // правка существующего проекта делает dirty
    const nameInput = screen.getByDisplayValue('Личный кабинет');
    fireEvent.input(nameInput, { target: { value: '  Личный кабинет v2  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(update).toHaveBeenCalledTimes(1);
    const [id, patch] = update.mock.calls[0]!;
    expect(id).toBe('e1');
    const history = (patch as { projectHistory: { name: string }[] }).projectHistory;
    expect(history).toHaveLength(2);
    const names = history.map((h) => h.name);
    expect(names).toContain('Личный кабинет v2');
    expect(names).toContain('Платёжный шлюз');
  });
});

describe('ExtraTab', () => {
  it('подставляет ИПР и историю команд', () => {
    render(<ExtraTab employee={sampleEmployee()} />);
    expect(screen.getByDisplayValue('System Design')).not.toBeNull();
    expect(screen.getByDisplayValue('ЕФС')).not.toBeNull();
    expect(screen.getByDisplayValue('Сити+')).not.toBeNull();
  });

  it('Сохранить пишет development и teamHistory; пустые зоны отсеиваются', () => {
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    render(<ExtraTab employee={sampleEmployee()} />);
    fireEvent.click(screen.getByRole('button', { name: /добавить зону/i }));
    // правка существующей зоны делает dirty
    const zone = screen.getByDisplayValue('System Design');
    fireEvent.input(zone, { target: { value: 'System Design — расширено' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(update).toHaveBeenCalledTimes(1);
    const [, patch] = update.mock.calls[0]!;
    const dev = (patch as { development: { zone: string }[] }).development;
    expect(dev).toHaveLength(1);
    expect(dev[0]!.zone).toBe('System Design — расширено');
    const th = (patch as { teamHistory: { from: string }[] }).teamHistory;
    expect(th).toHaveLength(1);
    expect(th[0]!.from).toBe('ЕФС');
  });
});
