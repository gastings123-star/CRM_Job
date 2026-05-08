/**
 * Доменные функции работы с датами для Staff CRM.
 *
 * Все функции — pure: ничего не читают из глобалов, явно принимают `now`.
 * ISO-формат дат — `YYYY-MM-DD`. Пустая строка — допустимое «отсутствие»
 * (legacy-данные часто содержат `''` вместо `null`).
 */

/** Кол-во дней в месяце. `monthIndex0` — JS-индекс месяца 0..11. */
export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/** Разница в полных месяцах между датами. Знак положительный, если `to > from`. */
export function monthDiff(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/** Кол-во полных календарных дней между датами. */
export function dayDiff(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Парсит ISO-дату (`YYYY-MM-DD` или ISO-timestamp). `null` — для пустой/невалидной.
 *
 * Для формы `YYYY-MM-DD` создаём дату как локальную полночь, иначе `new Date('YYYY-MM-DD')`
 * интерпретируется как UTC и при не-UTC таймзоне ломает арифметику дней на границах
 * месяца/квартала (см. `quarterMonths`, который строит даты в локальной зоне).
 */
export function parseIsoDate(iso: string): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO-метка `YYYY-MM-DD` для даты в локальной зоне. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Сколько полных месяцев прошло от ISO-даты до `now`.
 * Возвращает `-1`, если дата пустая или невалидная — это соответствует
 * семантике legacy `monthDiff('')` (используется как «нет данных»).
 */
export function monthsSince(iso: string, now: Date): number {
  const d = parseIsoDate(iso);
  if (!d) return -1;
  return monthDiff(d, now);
}

/** Стаж в месяцах от `hireDate` до `now`. `-1` — если дата пустая. */
export function tenureMonths(hireDateIso: string, now: Date): number {
  return monthsSince(hireDateIso, now);
}

/** Метка квартала для даты, напр. `Q2 2026`. */
export function quarterLabel(date: Date): string {
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `Q${q} ${date.getFullYear()}`;
}

/** Парсит метку квартала `Q1 2026` → `{ q, year }` или `null`. */
export function parseQuarterLabel(label: string): { q: 1 | 2 | 3 | 4; year: number } | null {
  const m = /^Q([1-4]) (\d{4})$/.exec(label);
  if (!m) return null;
  return { q: Number(m[1]) as 1 | 2 | 3 | 4, year: Number(m[2]) };
}

/** Первые числа трёх месяцев квартала. Пустой массив, если `label` невалиден. */
export function quarterMonths(label: string): Date[] {
  const parsed = parseQuarterLabel(label);
  if (!parsed) return [];
  const startMonth = (parsed.q - 1) * 3;
  return [0, 1, 2].map((i) => new Date(parsed.year, startMonth + i, 1));
}

/** Последний день третьего месяца квартала. `null` — если `label` невалиден. */
export function quarterEnd(label: string): Date | null {
  const months = quarterMonths(label);
  const last = months[months.length - 1];
  if (!last) return null;
  return new Date(last.getFullYear(), last.getMonth() + 1, 0);
}

/**
 * Кол-во рабочих дней в квартале.
 * Аппроксимация ≈ 5/7 от календарных, как в legacy.
 */
export function quarterWorkDays(label: string): number {
  return quarterMonths(label).reduce((sum, m) => {
    return sum + Math.round((daysInMonth(m.getFullYear(), m.getMonth()) * 5) / 7);
  }, 0);
}

/** Пересекаются ли периоды `[a1..a2]` и `[b1..b2]` (включая границы). */
export function overlapsPeriod(a1: Date, a2: Date, b1: Date, b2: Date): boolean {
  return a1.getTime() <= b2.getTime() && b1.getTime() <= a2.getTime();
}

/** Понедельник (00:00) той недели, в которой лежит `d`. */
export function startOfWeek(d: Date): Date {
  // JS: 0=вс..6=сб; неделя начинается с понедельника.
  const diff = (d.getDay() + 6) % 7;
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - diff);
  return r;
}
