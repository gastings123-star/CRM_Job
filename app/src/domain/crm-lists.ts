/**
 * Преднастроенные срезы списка сотрудников (smart lists).
 *
 * Каждый срез описан как pure-предикат `(e, now) => boolean`, чтобы
 * легко тестировать и комбинировать.
 *
 * Используется в `CrmScreen` как ряд быстрых чипов над таблицей.
 */
import type { Employee } from '@/data/schema';
import { dayDiff, monthsSince, parseIsoDate, toIsoDate } from './dates';
import { calcRiskScore } from './risk';

export type SmartListId =
  | 'all'
  | 'high-risk'
  | 'ready-now'
  | 'no-1on1-30'
  | 'fot-overdue'
  | 'overload';

export interface SmartList {
  id: SmartListId;
  label: string;
  /** Цветовой акцент для активного состояния. */
  tone: 'neutral' | 'red' | 'amber' | 'emerald' | 'blue' | 'purple';
  predicate: (e: Employee, now: Date) => boolean;
}

export const SMART_LISTS: SmartList[] = [
  { id: 'all', label: 'Все', tone: 'neutral', predicate: () => true },
  {
    id: 'high-risk',
    label: 'Под риском',
    tone: 'red',
    predicate: (e, now) => calcRiskScore(e, now).level === 'high',
  },
  {
    id: 'ready-now',
    label: 'Готовы к повышению',
    tone: 'emerald',
    predicate: (e) => e.promotionReadiness === 'готов сейчас',
  },
  {
    id: 'no-1on1-30',
    label: 'Без 1-on-1 > 30 дней',
    tone: 'amber',
    predicate: (e, now) => {
      const last = e.oneOnOne?.history?.[0]?.date ?? '';
      if (!last) return true; // вообще не проводили — тоже сюда
      const d = parseIsoDate(last);
      if (!d) return true;
      return dayDiff(d, now) > 30;
    },
  },
  {
    id: 'fot-overdue',
    label: 'ФОТ просрочен',
    tone: 'red',
    predicate: (e, now) => monthsSince(e.salaryReviewDate ?? '', now) > 12,
  },
  {
    id: 'overload',
    label: 'Перегрузка >100%',
    tone: 'purple',
    predicate: (e) => (Number(e.load?.currentPercent) || 0) > 100,
  },
];

export function countMatching(employees: Employee[], list: SmartList, now: Date): number {
  return employees.reduce((n, e) => n + (list.predicate(e, now) ? 1 : 0), 0);
}

/**
 * Дней с последнего 1-on-1. `null` — если ещё не проводился.
 */
export function daysSinceLastOneOnOne(e: Employee, now: Date): number | null {
  const last = e.oneOnOne?.history?.[0]?.date ?? '';
  if (!last) return null;
  const d = parseIsoDate(last);
  if (!d) return null;
  return dayDiff(d, now);
}

/** Текущая ISO-дата для дат-входов / сравнений. */
export function todayIso(now: Date): string {
  return toIsoDate(now);
}
