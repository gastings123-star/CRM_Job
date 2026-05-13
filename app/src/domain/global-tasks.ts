/**
 * Лента задач по всем сотрудникам — pure-функции для построения,
 * фильтрации и сортировки. UI потребляет это в `/tasks`.
 */
import type { Employee } from '@/data/schema';
import { parseIsoDate, toIsoDate } from './dates';

export interface GlobalTask {
  /** Сотрудник. */
  empId: string;
  empName: string;
  /** Индекс задачи в массиве `employee.tasks` — нужен для inline-toggle. */
  index: number;
  text: string;
  status: string;
  due: string;
  /** Дней до дедлайна; отрицательно — просрочено; null — без даты. */
  daysToDue: number | null;
  /** true если status === 'выполнена'. */
  done: boolean;
}

export type TaskFilter =
  | 'all'
  | 'open'
  | 'overdue'
  | 'upcoming-7'
  | 'upcoming-30'
  | 'no-due'
  | 'done';

export function buildGlobalTasks(employees: Employee[], now: Date): GlobalTask[] {
  const todayIso = toIsoDate(now);
  const today = parseIsoDate(todayIso);
  const out: GlobalTask[] = [];
  for (const e of employees) {
    const tasks = e.tasks ?? [];
    tasks.forEach((t, i) => {
      const done = t.status === 'выполнена';
      let daysToDue: number | null = null;
      if (t.due) {
        const d = parseIsoDate(t.due);
        if (d && today) {
          daysToDue = Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
        }
      }
      out.push({
        empId: e.id,
        empName: e.fullName || '— без имени —',
        index: i,
        text: t.text,
        status: t.status,
        due: t.due,
        daysToDue,
        done,
      });
    });
  }
  return out;
}

export function applyFilter(rows: GlobalTask[], filter: TaskFilter): GlobalTask[] {
  switch (filter) {
    case 'all':
      return rows;
    case 'open':
      return rows.filter((r) => !r.done);
    case 'overdue':
      return rows.filter((r) => !r.done && r.daysToDue !== null && r.daysToDue < 0);
    case 'upcoming-7':
      return rows.filter(
        (r) => !r.done && r.daysToDue !== null && r.daysToDue >= 0 && r.daysToDue <= 7,
      );
    case 'upcoming-30':
      return rows.filter(
        (r) => !r.done && r.daysToDue !== null && r.daysToDue >= 0 && r.daysToDue <= 30,
      );
    case 'no-due':
      return rows.filter((r) => !r.done && r.daysToDue === null);
    case 'done':
      return rows.filter((r) => r.done);
  }
}

/**
 * Сортируем по: просрочено сильнее → скорее → без даты → выполненные внизу.
 */
export function sortByUrgency(rows: GlobalTask[]): GlobalTask[] {
  return [...rows].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const av = a.daysToDue;
    const bv = b.daysToDue;
    if (av === null && bv === null) return a.empName.localeCompare(b.empName);
    if (av === null) return 1;
    if (bv === null) return -1;
    return av - bv;
  });
}
