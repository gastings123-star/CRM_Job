/**
 * Сводки по развитию сотрудников: ИПР, оценки, готовность к повышению, навыки.
 *
 * Не привязано к UI — все функции принимают `Employee[]` и текущую дату
 * (где надо) и возвращают агрегаты. Тестируется юнитами.
 */
import type { DevelopmentItem, Employee, PromotionReadiness } from '@/data/schema';
import { parseIsoDate, toIsoDate } from './dates';

/** Запись ИПР с привязкой к сотруднику — для общих лент. */
export interface DevelopmentRow {
  empId: string;
  empName: string;
  zone: string;
  status: string;
  deadline: string;
  /** Кол-во дней до/после дедлайна (отрицательно — просрочено). null — если deadline пуст. */
  daysToDeadline: number | null;
}

function rows(employees: Employee[]): DevelopmentRow[] {
  const out: DevelopmentRow[] = [];
  for (const e of employees) {
    for (const d of e.development ?? []) {
      out.push({
        empId: e.id,
        empName: e.fullName || '— без имени —',
        zone: d.zone,
        status: d.status,
        deadline: d.deadline,
        daysToDeadline: null, // заполнится ниже
      });
    }
  }
  return out;
}

function withDays(rows: DevelopmentRow[], now: Date): DevelopmentRow[] {
  const todayIso = toIsoDate(now);
  return rows.map((r) => {
    if (!r.deadline) return { ...r, daysToDeadline: null };
    const d = parseIsoDate(r.deadline);
    if (!d) return { ...r, daysToDeadline: null };
    // Считаем разницу по календарным дням (день в день = 0).
    const today = parseIsoDate(todayIso);
    if (!today) return r;
    const ms = d.getTime() - today.getTime();
    return { ...r, daysToDeadline: Math.round(ms / (24 * 60 * 60 * 1000)) };
  });
}

function isDone(item: DevelopmentItem | DevelopmentRow): boolean {
  return item.status === 'выполнено';
}

/** Просроченные ИПР (deadline в прошлом, не выполнено). */
export function overdueIpr(employees: Employee[], now: Date): DevelopmentRow[] {
  return withDays(rows(employees), now)
    .filter((r) => !isDone(r) && r.daysToDeadline !== null && r.daysToDeadline < 0)
    .sort((a, b) => (a.daysToDeadline ?? 0) - (b.daysToDeadline ?? 0));
}

/** Скоро (deadline в ближайшие N дней, по умолчанию 30, не выполнено). */
export function upcomingIpr(employees: Employee[], now: Date, windowDays = 30): DevelopmentRow[] {
  return withDays(rows(employees), now)
    .filter(
      (r) =>
        !isDone(r) &&
        r.daysToDeadline !== null &&
        r.daysToDeadline >= 0 &&
        r.daysToDeadline <= windowDays,
    )
    .sort((a, b) => (a.daysToDeadline ?? 0) - (b.daysToDeadline ?? 0));
}

/** Готовность к повышению — сгруппированные сотрудники. */
export function byPromotionReadiness(employees: Employee[]): Record<PromotionReadiness, Employee[]> {
  const out: Record<PromotionReadiness, Employee[]> = {
    'не готов': [],
    'готов через 6 мес': [],
    'готов через год': [],
    'готов сейчас': [],
  };
  for (const e of employees) {
    const key: PromotionReadiness = e.promotionReadiness ?? 'не готов';
    out[key].push(e);
  }
  return out;
}

/** Сотрудники с низкой оценкой руководителя (score < threshold). */
export function lowRated(employees: Employee[], threshold = 3): Employee[] {
  return employees
    .filter((e) => (e.managerRating?.score ?? 3) < threshold)
    .sort((a, b) => (a.managerRating?.score ?? 0) - (b.managerRating?.score ?? 0));
}

/** Топ-навыков с количеством обладателей. */
export interface SkillStat {
  name: string;
  total: number;
  /** Сколько экспертов (level >= 4). */
  experts: number;
  /** Средний уровень. */
  avgLevel: number;
}

export function topSkills(employees: Employee[], limit = 20): SkillStat[] {
  const stats = new Map<string, { sum: number; count: number; experts: number }>();
  for (const e of employees) {
    for (const s of e.skills ?? []) {
      const n = s.name?.trim() ?? '';
      if (!n) continue;
      const cur = stats.get(n) ?? { sum: 0, count: 0, experts: 0 };
      cur.sum += s.level;
      cur.count += 1;
      if (s.level >= 4) cur.experts += 1;
      stats.set(n, cur);
    }
  }
  return [...stats.entries()]
    .map(([name, v]) => ({
      name,
      total: v.count,
      experts: v.experts,
      avgLevel: v.count === 0 ? 0 : Math.round((v.sum / v.count) * 10) / 10,
    }))
    .sort((a, b) => b.total - a.total || b.experts - a.experts || a.name.localeCompare(b.name))
    .slice(0, limit);
}
