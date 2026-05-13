import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';

vi.mock('@/infra/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { employeesRepo } from '@/infra/repos';
import { BasicInfoTab } from '@/ui/screens/crm/tabs/BasicInfoTab';
import { LoadTab } from '@/ui/screens/crm/tabs/LoadTab';
import { toastsSignal } from '@/state/ui';
import type { Employee } from '@/data/schema';

function sampleEmployee(overrides: Partial<Employee> = {}): Employee {
  const base = {
    id: 'e1',
    fullName: 'Иван Иванов',
    role: 'Frontend',
    team: 'ЕФС',
    hireDate: '2024-01-01',
    salaryReviewDate: '2024-06-01',
    salary: 100000,
    employeeNumber: '',
    positionId: '',
    location: 'Уфа',
    email: 'i@b.c',
    teams: '',
    telegram: '',
    grade: 'Middle',
    birthday: '',
    load: {
      currentDays: 0,
      currentPercent: 0,
      capacityQuarter: 60,
      capacityQtr: 'Q2 2026',
      status: 'доступен',
      nextMonthPlan: 0,
      vacations: [],
      sickLeaves: [],
      projects: ['Проект A'],
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
  } as unknown as Employee;
  return { ...base, ...overrides };
}

afterEach(() => {
  toastsSignal.value = [];
  vi.restoreAllMocks();
});

describe('BasicInfoTab', () => {
  it('подставляет начальные значения сотрудника', () => {
    render(<BasicInfoTab employee={sampleEmployee()} />);
    expect(screen.getByDisplayValue('Иван Иванов')).not.toBeNull();
    expect(screen.getByDisplayValue('Frontend')).not.toBeNull();
    expect(screen.getByDisplayValue('ЕФС')).not.toBeNull();
    expect(screen.getByDisplayValue('Уфа')).not.toBeNull();
  });

  it('кнопки Сохранить/Отменить выключены, пока нет изменений', () => {
    render(<BasicInfoTab employee={sampleEmployee()} />);
    const save = screen.getByRole('button', { name: 'Сохранить' });
    expect(save).toHaveProperty('disabled', true);
  });

  it('правка поля делает форму dirty и Save вызывает repo.update с патчем', () => {
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    render(<BasicInfoTab employee={sampleEmployee()} />);
    const role = screen.getByDisplayValue('Frontend');
    fireEvent.input(role, { target: { value: 'Backend' } });
    const save = screen.getByRole('button', { name: 'Сохранить' });
    expect(save).toHaveProperty('disabled', false);
    fireEvent.click(save);
    expect(update).toHaveBeenCalledTimes(1);
    const [id, patch] = update.mock.calls[0]!;
    expect(id).toBe('e1');
    expect(patch).toMatchObject({ role: 'Backend' });
  });

  it('пустое ФИО при сохранении → ошибка-тост, repo.update не вызывается', () => {
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    render(<BasicInfoTab employee={sampleEmployee()} />);
    const fullName = screen.getByDisplayValue('Иван Иванов');
    fireEvent.input(fullName, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(update).not.toHaveBeenCalled();
    expect(toastsSignal.value.some((t) => t.kind === 'error')).toBe(true);
  });
});

describe('LoadTab', () => {
  it('рендерит метку квартала и текущий проект из load', () => {
    render(<LoadTab employee={sampleEmployee()} />);
    expect(screen.getByDisplayValue('Q2 2026')).not.toBeNull();
    expect(screen.getByDisplayValue('Проект A')).not.toBeNull();
  });

  it('кнопка «+ Добавить период» появляется и не падает при клике', () => {
    render(<LoadTab employee={sampleEmployee()} />);
    // в форме две таких кнопки — для отпусков и для больничных
    const addButtons = screen.getAllByRole('button', { name: /добавить период/i });
    expect(addButtons.length).toBe(2);
    fireEvent.click(addButtons[0]!);
    // после клика появилась пара date-инпутов (from / to)
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
  });

  it('Сохранить вызывает repo.update с обновлённым load', () => {
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    render(<LoadTab employee={sampleEmployee()} />);
    const qtr = screen.getByDisplayValue('Q2 2026');
    fireEvent.input(qtr, { target: { value: 'Q3 2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(update).toHaveBeenCalledTimes(1);
    const [id, patch] = update.mock.calls[0]!;
    expect(id).toBe('e1');
    expect(patch).toHaveProperty('load.capacityQtr', 'Q3 2026');
  });
});
