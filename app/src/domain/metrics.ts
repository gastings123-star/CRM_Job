/**
 * Командные/портфельные метрики.
 * Перенесено из legacy `index.html#busFactor / overdueDensity`.
 */
import type { Employee } from '@/data/schema';
import { toIsoDate } from './dates';

/**
 * Bus factor — кол-во сотрудников, у которых < 2 навыков уровня 4+.
 * Чем больше — тем хуже устойчивость команды (мало «дублёров» по компетенциям).
 */
export function busFactor(employees: Employee[]): number {
  return employees.filter((e) => (e.skills ?? []).filter((s) => Number(s.level) >= 4).length < 2)
    .length;
}

/**
 * Доля просроченных задач от всех незавершённых, в процентах (0..100, целое).
 * Считаются только задачи со статусом != 'выполнена'.
 */
export function overdueDensity(employees: Employee[], now: Date): number {
  const todayStr = toIsoDate(now);
  let total = 0;
  let overdue = 0;
  for (const e of employees) {
    for (const t of e.tasks ?? []) {
      if (t.status !== 'выполнена') {
        total++;
        if (t.due && t.due < todayStr) overdue++;
      }
    }
  }
  return total > 0 ? Math.round((overdue / total) * 100) : 0;
}
