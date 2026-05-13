import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';

vi.mock('@/infra/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { employeesRepo } from '@/infra/repos';
import { SkillsTab } from '@/ui/screens/crm/tabs/SkillsTab';
import { GoalsTab } from '@/ui/screens/crm/tabs/GoalsTab';
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
    skills: [
      { name: 'React', level: 4 },
      { name: 'SQL', level: 2 },
    ],
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
    goalsCurrentPeriod: 'H1 2026',
    goals: [
      { text: 'Запустить дашборд', status: 'в работе', progress: 40 },
      { text: 'Найти двух стажёров', status: 'не начата', progress: 0 },
    ],
    goalsSummary: { score: 3, comment: '', date: '' },
    teamHistory: [],
  } as unknown as Employee;
  return { ...base, ...overrides };
}

afterEach(() => {
  toastsSignal.value = [];
  vi.restoreAllMocks();
});

describe('SkillsTab', () => {
  it('рендерит существующие навыки и уровни', () => {
    render(<SkillsTab employee={sampleEmployee()} />);
    expect(screen.getByDisplayValue('React')).not.toBeNull();
    expect(screen.getByDisplayValue('SQL')).not.toBeNull();
  });

  it('добавление нового навыка через кнопку', () => {
    render(<SkillsTab employee={sampleEmployee()} />);
    fireEvent.click(screen.getByRole('button', { name: /добавить навык/i }));
    const inputs = document.querySelectorAll('input[placeholder="React, SQL, переговоры…"]');
    expect(inputs.length).toBe(3);
  });

  it('Сохранить вызывает repo.update со списком skills (trim, без пустых)', () => {
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    render(<SkillsTab employee={sampleEmployee()} />);
    // меняем имя первого навыка с пробелами
    const react = screen.getByDisplayValue('React');
    fireEvent.input(react, { target: { value: '  TypeScript  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(update).toHaveBeenCalledTimes(1);
    const [id, patch] = update.mock.calls[0]!;
    expect(id).toBe('e1');
    const skills = (patch as { skills: { name: string }[] }).skills;
    expect(skills.map((s) => s.name)).toEqual(['TypeScript', 'SQL']);
  });

  it('пустой навык отфильтровывается при сохранении', () => {
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    render(<SkillsTab employee={sampleEmployee()} />);
    fireEvent.click(screen.getByRole('button', { name: /добавить навык/i }));
    // добавили пустой третий — сохранение должно его выкинуть
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    const skills = (update.mock.calls[0]![1] as { skills: unknown[] }).skills;
    expect(skills.length).toBe(2);
  });
});

describe('GoalsTab', () => {
  it('рендерит текущие цели и контекст периода', () => {
    render(<GoalsTab employee={sampleEmployee()} />);
    expect(screen.getByDisplayValue('H1 2026')).not.toBeNull();
    expect(screen.getByDisplayValue('Запустить дашборд')).not.toBeNull();
    expect(screen.getByDisplayValue('Найти двух стажёров')).not.toBeNull();
  });

  it('добавление цели и сохранение → patch содержит обе старые + новую (если заполнена)', () => {
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    render(<GoalsTab employee={sampleEmployee()} />);
    fireEvent.click(screen.getByRole('button', { name: /добавить цель/i }));
    const inputs = screen.getAllByPlaceholderText(/что нужно сделать/i);
    fireEvent.input(inputs[inputs.length - 1]!, { target: { value: 'Запустить онбординг' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    const goals = (update.mock.calls[0]![1] as { goals: { text: string }[] }).goals;
    expect(goals.map((g) => g.text)).toEqual([
      'Запустить дашборд',
      'Найти двух стажёров',
      'Запустить онбординг',
    ]);
  });

  it('правка summaryScore — Save шлёт обновлённый goalsSummary', () => {
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    render(<GoalsTab employee={sampleEmployee()} />);
    const score = screen.getByDisplayValue('3');
    fireEvent.input(score, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    const patch = update.mock.calls[0]![1] as { goalsSummary: { score: number } };
    expect(patch.goalsSummary.score).toBe(5);
  });
});
