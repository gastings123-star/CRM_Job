import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';

vi.mock('@/infra/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { employeesRepo } from '@/infra/repos';
import { NotesTab } from '@/ui/screens/crm/tabs/NotesTab';
import { confirmSignal, resolveConfirm, toastsSignal } from '@/state/ui';
import type { Employee, EmployeeNote } from '@/data/schema';

function emp(notes: EmployeeNote[]): Employee {
  return {
    id: 'e1',
    fullName: 'Тестовый',
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
    managerComments: notes,
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
}

afterEach(() => {
  toastsSignal.value = [];
  confirmSignal.value = null;
  vi.restoreAllMocks();
});

describe('NotesTab', () => {
  it('empty state — нет заметок', () => {
    render(<NotesTab employee={emp([])} />);
    expect(screen.getByText(/заметок пока нет/i)).not.toBeNull();
  });

  it('рендерит заметки новые сверху и плашки тона', () => {
    const notes: EmployeeNote[] = [
      { id: '1', date: '2026-04-01', tone: 'positive', from: 'Лид', text: 'Хорошо отработал' },
      { id: '2', date: '2026-05-13', tone: 'concern', from: 'DPO', text: 'Срывает дедлайны' },
    ];
    render(<NotesTab employee={emp(notes)} />);
    const items = document.querySelectorAll('li');
    expect(items.length).toBe(2);
    // первая — новая (concern)
    expect(items[0]?.textContent).toContain('Срывает дедлайны');
    expect(items[1]?.textContent).toContain('Хорошо отработал');
    // плашка-счётчик
    expect(screen.getByText(/всего 2/)).not.toBeNull();
  });

  it('добавление: показывает форму, submit вызывает repo.update', async () => {
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    render(<NotesTab employee={emp([])} />);
    fireEvent.click(screen.getByRole('button', { name: /заметка/i }));
    const textArea = await screen.findByPlaceholderText(/что произошло/i);
    fireEvent.input(textArea, { target: { value: 'Похвалил на демо' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(update).toHaveBeenCalledTimes(1);
    const [id, patch] = update.mock.calls[0]!;
    expect(id).toBe('e1');
    const patched = patch as { managerComments: EmployeeNote[] };
    expect(patched.managerComments[0]?.text).toBe('Похвалил на демо');
  });

  it('пустой текст — ошибка, repo.update не вызывается', () => {
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    render(<NotesTab employee={emp([])} />);
    fireEvent.click(screen.getByRole('button', { name: /заметка/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(update).not.toHaveBeenCalled();
    expect(toastsSignal.value.some((t) => t.kind === 'error')).toBe(true);
  });

  it('удаление: confirm → repo.update без удалённой записи', async () => {
    const update = vi.spyOn(employeesRepo, 'update').mockImplementation(() => undefined);
    const notes: EmployeeNote[] = [
      { id: '1', date: '2026-05-13', tone: 'neutral', from: '', text: 'Заметка' },
    ];
    render(<NotesTab employee={emp(notes)} />);
    const delBtn = screen.getByRole('button', { name: 'Удалить' });
    fireEvent.click(delBtn);
    await waitFor(() => expect(confirmSignal.value).not.toBeNull());
    resolveConfirm(true);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [, patch] = update.mock.calls[0]!;
    expect((patch as { managerComments: EmployeeNote[] }).managerComments).toEqual([]);
  });
});
