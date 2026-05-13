import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';

vi.mock('@/infra/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { employeesRepo } from '@/infra/repos';
import { OneOnOneTab } from '@/ui/screens/crm/tabs/OneOnOneTab';
import { toastsSignal } from '@/state/ui';
import type { Employee, OneOnOne } from '@/data/schema';

function makeEmployee(over: Partial<Employee> = {}): Employee {
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
    tasks: [],
    oneOnOne: {
      nextDate: '',
      prepNotes: 'Обсудить релиз',
      history: [],
      agendaChecklist: {
        feedback: true,
        goals: false,
        load: true,
        growth: false,
        wellbeing: false,
      },
      agendaExtra: '',
    } as OneOnOne,
    goalsCurrentPeriod: '',
    goals: [],
    goalsSummary: { score: 3, comment: '', date: '' },
    teamHistory: [],
  } as unknown as Employee;
  return { ...base, ...over };
}

afterEach(() => {
  toastsSignal.value = [];
  vi.restoreAllMocks();
});

describe('OneOnOneTab — закрытие встречи', () => {
  it('кнопка «Завершить встречу» открывает модалку', () => {
    render(<OneOnOneTab employee={makeEmployee()} />);
    fireEvent.click(screen.getByRole('button', { name: /завершить встречу/i }));
    expect(screen.getByRole('dialog', { name: /завершить 1-on-1/i })).not.toBeNull();
  });

  it('модалка стартует с резюме = prepNotes сотрудника', () => {
    render(<OneOnOneTab employee={makeEmployee()} />);
    fireEvent.click(screen.getByRole('button', { name: /завершить встречу/i }));
    // На странице prepNotes уже отрисована во вкладке, поэтому ищем внутри модалки.
    const dlg = screen.getByRole('dialog', { name: /завершить 1-on-1/i });
    const summaryTa = dlg.querySelector('textarea');
    expect(summaryTa).not.toBeNull();
    expect(summaryTa?.value).toBe('Обсудить релиз');
  });

  it('«Завершить и сохранить» пишет в репо: история + tasks + reset', async () => {
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    render(<OneOnOneTab employee={makeEmployee()} />);
    fireEvent.click(screen.getByRole('button', { name: /завершить встречу/i }));

    // Добавим один follow-up через поле + кнопку «+ Добавить»
    const fuInput = screen.getByPlaceholderText(/что нужно сделать/i);
    fireEvent.input(fuInput, { target: { value: 'Подготовить отчёт' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Добавить' }));

    fireEvent.click(screen.getByRole('button', { name: /завершить и сохранить/i }));

    await waitFor(() => {
      expect(update).toHaveBeenCalledTimes(1);
    });
    const patch = update.mock.calls[0]![1];
    // 1) В историю записалась запись с резюме и чеклистом
    expect(patch.oneOnOne?.history?.length).toBe(1);
    const item = patch.oneOnOne!.history[0] as {
      summary?: string;
      followUps?: string[];
      checklist?: OneOnOne['agendaChecklist'];
    };
    expect(item.summary).toBe('Обсудить релиз');
    expect(item.followUps).toEqual(['Подготовить отчёт']);
    expect(item.checklist?.feedback).toBe(true);
    // 2) Чеклист и prepNotes сброшены
    expect(patch.oneOnOne?.prepNotes).toBe('');
    expect(patch.oneOnOne?.agendaChecklist.feedback).toBe(false);
    // 3) Follow-up попал в задачи
    expect(patch.tasks?.length).toBe(1);
    expect(patch.tasks?.[0]?.text).toBe('Подготовить отчёт');
    expect(patch.tasks?.[0]?.status).toBe('не начата');
    // 4) Дата следующей встречи установлена (не пустая)
    expect(patch.oneOnOne?.nextDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('закрытие без follow-up не добавляет в tasks', async () => {
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    render(<OneOnOneTab employee={makeEmployee()} />);
    fireEvent.click(screen.getByRole('button', { name: /завершить встречу/i }));
    fireEvent.click(screen.getByRole('button', { name: /завершить и сохранить/i }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledTimes(1);
    });
    const patch = update.mock.calls[0]![1];
    // tasks остались как у сотрудника, т.е. []
    expect(patch.tasks).toEqual([]);
  });
});
