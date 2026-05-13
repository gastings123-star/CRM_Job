/**
 * Pure-функции для аналитики пульса команд.
 *
 * Используются вкладкой «Пульс» на карточке команды:
 *  - перевод даты в «понедельник недели» (ISO weekStart);
 *  - последняя N недель и упорядоченные снэпшоты команды;
 *  - streak текущего статуса;
 *  - частота эскалаций за окно N недель;
 *  - линейный тренд tailIndex (slope) для индикатора ↘/→/↗;
 *  - точки спарклайна и расчёт path для SVG (по 12 неделям).
 *
 * Хранилище: каждый снэпшот — отдельная запись `team_pulse` (см. SQL-миграцию).
 */
import type { PulseStatus, TeamPulseSnapshot } from '@/data/schema';
import { parseIsoDate, toIsoDate } from './dates';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Понедельник недели для произвольной даты — в ISO `YYYY-MM-DD`. */
export function mondayOf(d: Date): string {
  const dow = d.getDay(); // 0=Вс ... 6=Сб
  const offset = (dow + 6) % 7; // Пн → 0
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
  return toIsoDate(m);
}

/**
 * Список понедельников за последние N недель, по убыванию (последняя — ближе к now).
 * `[weekStart_(N-1), ..., weekStart_1, weekStart_0]` — где 0 = текущая неделя.
 */
export function recentWeeks(now: Date, count: number): string[] {
  const today = mondayOf(now);
  const baseDate = parseIsoDate(today);
  if (!baseDate) return [];
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(baseDate.getTime() - i * 7 * DAY_MS);
    out.push(toIsoDate(d));
  }
  return out;
}

/** Снэпшоты конкретной команды, отсортированы по weekStart ascending. */
export function snapshotsForTeam(
  all: TeamPulseSnapshot[],
  teamId: string,
): TeamPulseSnapshot[] {
  return all
    .filter((s) => s.teamId === teamId)
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : a.weekStart > b.weekStart ? 1 : 0));
}

/**
 * Сколько недель подряд держится текущий статус (от последнего снэпшота назад).
 * Возвращает 0 если снэпшотов нет.
 */
export function currentStreak(sorted: TeamPulseSnapshot[]): {
  status: PulseStatus | null;
  weeks: number;
} {
  if (sorted.length === 0) return { status: null, weeks: 0 };
  const last = sorted[sorted.length - 1]!;
  let weeks = 1;
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (sorted[i]!.status === last.status) weeks += 1;
    else break;
  }
  return { status: last.status, weeks };
}

/**
 * Сумма escalations за последние N недель (по `weekStart >= cutoff`).
 * Пропущенные недели = 0, не считаются.
 */
export function escalationsWindow(
  sorted: TeamPulseSnapshot[],
  now: Date,
  windowWeeks: number,
): number {
  const weeks = recentWeeks(now, windowWeeks);
  const earliest = weeks[0] ?? '';
  return sorted
    .filter((s) => s.weekStart >= earliest)
    .reduce((acc, s) => acc + (Number(s.escalations) || 0), 0);
}

/**
 * Линейная регрессия по `tailIndex` за последние N недель.
 * Возвращает наклон (per week). Положительный — растут хвосты, отрицательный — снижаются.
 * Если данных < 2 — возвращает 0.
 */
export function tailSlope(
  sorted: TeamPulseSnapshot[],
  now: Date,
  windowWeeks = 12,
): number {
  const weeks = recentWeeks(now, windowWeeks);
  const map = new Map(sorted.map((s) => [s.weekStart, s]));
  const xs: number[] = [];
  const ys: number[] = [];
  weeks.forEach((w, i) => {
    const snap = map.get(w);
    if (snap) {
      xs.push(i);
      ys.push(Number(snap.tailIndex) || 0);
    }
  });
  if (xs.length < 2) return 0;
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, b, i) => a + b * ys[i]!, 0);
  const sumXX = xs.reduce((a, b) => a + b * b, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/** Точки спарклайна по N неделям: `{ weekStart, value | null }`. */
export interface SparklinePoint {
  weekStart: string;
  value: number | null;
  status: PulseStatus | null;
}

export function sparklineData(
  sorted: TeamPulseSnapshot[],
  now: Date,
  windowWeeks = 12,
): SparklinePoint[] {
  const weeks = recentWeeks(now, windowWeeks);
  const map = new Map(sorted.map((s) => [s.weekStart, s]));
  return weeks.map((w) => {
    const s = map.get(w);
    return {
      weekStart: w,
      value: s ? Number(s.tailIndex) : null,
      status: s ? s.status : null,
    };
  });
}

/** SVG-path для линии спарклайна (только по непустым точкам). */
export function sparklinePath(
  points: SparklinePoint[],
  width: number,
  height: number,
): string {
  const max = 10; // tailIndex 0..10
  const min = 0;
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const yOf = (v: number): number =>
    height - ((v - min) / (max - min || 1)) * height;
  let d = '';
  let started = false;
  points.forEach((p, i) => {
    if (p.value === null) return;
    const x = i * stepX;
    const y = yOf(p.value);
    d += started ? ` L ${x.toFixed(1)} ${y.toFixed(1)}` : `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    started = true;
  });
  return d;
}

/**
 * Получить снэпшот за конкретную неделю, если есть.
 */
export function findSnapshot(
  sorted: TeamPulseSnapshot[],
  teamId: string,
  weekStart: string,
): TeamPulseSnapshot | undefined {
  return sorted.find((s) => s.teamId === teamId && s.weekStart === weekStart);
}
