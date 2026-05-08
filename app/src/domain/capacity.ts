/**
 * Прогноз ёмкости (capacity) сотрудника на квартал.
 * Перенесено из legacy `index.html#capacityForecast / vacDaysInQuarter`.
 */
import type { Employee, Period } from '@/data/schema';
import {
  parseIsoDate,
  quarterEnd,
  quarterMonths,
  quarterWorkDays,
  quarterLabel,
  overlapsPeriod,
  dayDiff,
} from './dates';

export type CapacityRisk = 'none' | 'ok' | 'med' | 'high';

export interface CapacityForecast {
  /** Метка квартала, под которую считалось. */
  label: string;
  /** Полная ёмкость в человеко-днях (paramsverride или расчётно). */
  totalCap: number;
  /** Дни отпусков и больничных, попавшие в квартал. */
  vacDays: number;
  /** Реальная ёмкость = `totalCap - vacDays` (≥ 0). */
  realCap: number;
  /** Уже использованные ЧД (`load.currentDays`). */
  usedDays: number;
  /** Свободные ЧД до конца квартала. */
  free: number;
  /** Категория риска по доле свободной ёмкости. */
  risk: CapacityRisk;
}

/**
 * Сколько дней отпусков+больничных сотрудника попадает в квартал `label`.
 * Учитываются только периоды с обеими валидными границами; пересекающиеся
 * с границами квартала — обрезаются.
 */
export function vacDaysInQuarter(e: Employee, label: string): number {
  const months = quarterMonths(label);
  const qStart = months[0];
  const qEnd = quarterEnd(label);
  if (!qStart || !qEnd) return 0;

  const periods: Period[] = [...(e.load?.vacations ?? []), ...(e.load?.sickLeaves ?? [])];

  let days = 0;
  for (const p of periods) {
    const pf = parseIsoDate(p.from ?? '');
    const pt = parseIsoDate(p.to ?? '');
    if (!pf || !pt) continue;
    if (!overlapsPeriod(pf, pt, qStart, qEnd)) continue;
    const from = pf < qStart ? qStart : pf;
    const to = pt > qEnd ? qEnd : pt;
    days += dayDiff(from, to) + 1;
  }
  return days;
}

/** Прогноз ёмкости для сотрудника в `now`-квартале (или указанном через `load.capacityQtr`). */
export function capacityForecast(e: Employee, now: Date): CapacityForecast {
  const label = e.load?.capacityQtr || quarterLabel(now);
  const totalCap = Number(e.load?.capacityQuarter) || quarterWorkDays(label);
  const vacDays = vacDaysInQuarter(e, label);
  const realCap = Math.max(0, totalCap - vacDays);
  const usedDays = Number(e.load?.currentDays) || 0;
  const free = Math.max(0, realCap - usedDays);

  let risk: CapacityRisk = 'ok';
  if (totalCap === 0) {
    risk = 'none';
  } else if (free / totalCap < 0.15) {
    risk = 'high';
  } else if (free / totalCap < 0.35) {
    risk = 'med';
  }

  return { label, totalCap, vacDays, realCap, usedDays, free, risk };
}
