import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';

vi.mock('@/infra/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { employeesRepo } from '@/infra/repos';
import { TasksTab } from '@/ui/screens/crm/tabs/TasksTab';
import { OneOnOneTab } from '@/ui/screens/crm/tabs/OneOnOneTab';
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
    tasks: [
      { text: 'Снять цели', status: 'в работе', due: '2026-06-01' },
      { text: 'Утвердить план', status: 'выполнена', due: '2026-05-01' },
    ],
    oneOnOne: {
      nextDate: '2026-06-10',
      prepNotes: 'обсудить риски',
      history: [{ date: '2026-04-01' }],
      agendaChecklist: {
        feedback: true,
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
  } as unknown as Employee;
  return { ...base, ...overrides };
}

afterEach(() => {
  toastsSignal.value = [];
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------
// TasksTab
// ---------------------------------------------------------------

describe('TasksTab', () => {
  it('рендерит существующие задачи и счётчик «1/2 выполнено»', () => {
    render(<TasksTab employee={sampleEmployee()} />);
    expect(screen.getByDisplayValue('Снять цели')).not.toBeNull();
    expect(screen.getByDisplayValue('Утвердить план')).not.toBeNull();
    expect(screen.getByText(/1\/2 выполнено/i)).not.toBeNull();
  });

  it('Сохранить пишет очищенный массив (триммит и убирает пустые) в repo', () => {
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    render(<TasksTab employee={sampleEmployee()} />);
    // Добавляем пустую задачу — она должна отфильтроваться при сохранении
    fireEvent.click(screen.getByRole('button', { name: /добавить задачу/i }));
    // правка существующей задачи делает форму dirty
    const text = screen.getByDisplayValue('Снять цели');
    fireEvent.input(text, { target: { value: '  Снять цели на квартал  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(update).toHaveBeenCalledTimes(1);
    const [id, patch] = update.mock.calls[0]!;
    expect(id).toBe('e1');
    const tasks = (patch as { tasks: { text: string }[] }).tasks;
    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.text).toBe('Снять цели на квартал');
  });
});

// ---------------------------------------------------------------
// OneOnOneTab
// ---------------------------------------------------------------

describe('OneOnOneTab', () => {
  it('подставляет дату следующей встречи, заметки и активный чекбокс', () => {
    render(<OneOnOneTab employee={sampleEmployee()} />);
    expect(screen.getByDisplayValue('2026-06-10')).not.toBeNull();
    expect(screen.getByDisplayValue('обсудить риски')).not.toBeNull();
    // первый чекбокс «feedback» уже отмечен в фикстуре
    const cb = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
    expect(cb.checked).toBe(true);
  });

  it('переключение чекбокса повестки делает форму dirty', () => {
    render(<OneOnOneTab employee={sampleEmployee()} />);
    const saveBefore = screen.getByRole('button', { name: 'Сохранить' });
    expect(saveBefore).toHaveProperty('disabled', true);
    // кликаем второй чекбокс (goals)
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]!);
    const saveAfter = screen.getByRole('button', { name: 'Сохранить' });
    expect(saveAfter).toHaveProperty('disabled', false);
  });
});
