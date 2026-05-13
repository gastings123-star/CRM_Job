/**
 * Построение событий календаря на конкретный месяц.
 *
 * Не привязано к UI: получает массив сотрудников и год/месяц, возвращает
 * `Map<isoDate, CalendarEvent[]>`. Подходит для месячной сетки.
 *
 * Типы событий:
 *  - `vacation`  — отпуск (заполняем все дни диапазона)
 *  - `sick`      — больничный
 *  - `birthday`  — годовщина дня рождения (каждый год)
 *  - `hire`      — годовщина найма (только если уже прошёл хотя бы 1 год)
 *  - `oneonone`  — запланированный 1-on-1 (e.oneOnOne.nextDate)
 *  - `taskDue`   — дедлайн задачи (e.tasks[].due, если статус != 'выполнена')
 *
 * Контракт: ISO-дата YYYY-MM-DD; день 0 = пустые ячейки.
 */
import type { Employee } from '@/data/schema';
import { parseIsoDate, toIsoDate } from './dates';

export type CalendarEventKind =
  | 'vacation'
  | 'sick'
  | 'birthday'
  | 'hire'
  | 'oneonone'
  | 'taskDue';

export interface CalendarEvent {
  kind: CalendarEventKind;
  /** ID сотрудника, к которому относится событие. */
  empId: string;
  /** Имя сотрудника (для отображения без поиска по списку). */
  empName: string;
  /** Краткий текст события — то, что показывается на чипе. */
  label: string;
}

/**
 * Считаем события месяца. `month` — индекс 0..11 (как в Date).
 */
export function buildMonthEvents(
  employees: Employee[],
  year: number,
  month: number,
): Map<string, CalendarEvent[]> {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0); // последний день месяца
  const monthStartIso = toIsoDate(monthStart);
  const monthEndIso = toIsoDate(monthEnd);

  const out = new Map<string, CalendarEvent[]>();
  const add = (iso: string, ev: CalendarEvent): void => {
    const list = out.get(iso);
    if (list) list.push(ev);
    else out.set(iso, [ev]);
  };

  for (const e of employees) {
    const name = e.fullName || '— без имени —';

    // --- Отпуска и больничные: интервалы, пересекающие месяц ---
    for (const v of e.load?.vacations ?? []) {
      if (!v.from && !v.to) continue;
      addRange(monthStartIso, monthEndIso, v.from, v.to, (iso) =>
        add(iso, { kind: 'vacation', empId: e.id, empName: name, label: 'Отпуск' }),
      );
    }
    for (const s of e.load?.sickLeaves ?? []) {
      if (!s.from && !s.to) continue;
      addRange(monthStartIso, monthEndIso, s.from, s.to, (iso) =>
        add(iso, { kind: 'sick', empId: e.id, empName: name, label: 'Больничный' }),
      );
    }

    // --- День рождения: повторяющийся ---
    if (e.birthday) {
      const bd = parseIsoDate(e.birthday);
      if (bd?.getMonth() === month) {
        const day = bd.getDate();
        if (day >= 1 && day <= monthEnd.getDate()) {
          const iso = toIsoDate(new Date(year, month, day));
          add(iso, { kind: 'birthday', empId: e.id, empName: name, label: 'День рождения' });
        }
      }
    }

    // --- Годовщина найма (только если уже >= 1 год прошёл) ---
    if (e.hireDate) {
      const hd = parseIsoDate(e.hireDate);
      if (hd?.getMonth() === month && hd.getFullYear() < year) {
        const day = hd.getDate();
        if (day >= 1 && day <= monthEnd.getDate()) {
          const iso = toIsoDate(new Date(year, month, day));
          const years = year - hd.getFullYear();
          add(iso, { kind: 'hire', empId: e.id, empName: name, label: `Годовщина (${years})` });
        }
      }
    }

    // --- Запланированный 1-on-1 ---
    if (e.oneOnOne?.nextDate) {
      if (isInMonth(e.oneOnOne.nextDate, year, month)) {
        add(e.oneOnOne.nextDate, { kind: 'oneonone', empId: e.id, empName: name, label: '1-on-1' });
      }
    }

    // --- Дедлайны задач (если не выполнена) ---
    for (const t of e.tasks ?? []) {
      if (!t.due || t.status === 'выполнена') continue;
      if (isInMonth(t.due, year, month)) {
        const label = t.text ? `Задача: ${t.text}` : 'Задача';
        add(t.due, { kind: 'taskDue', empId: e.id, empName: name, label });
      }
    }
  }

  return out;
}

/** Проверка попадания ISO-даты в указанный год/месяц. */
function isInMonth(iso: string, year: number, month: number): boolean {
  const d = parseIsoDate(iso);
  if (!d) return false;
  return d.getFullYear() === year && d.getMonth() === month;
}

/**
 * Перебирает дни пересечения [from..to] с [monthStart..monthEnd] и зовёт cb на каждый.
 * Если одна из границ диапазона пуста — считаем интервал «открытым» (используем
 * вторую границу или весь месяц).
 */
function addRange(
  monthStartIso: string,
  monthEndIso: string,
  fromIso: string,
  toIso: string,
  cb: (iso: string) => void,
): void {
  const from = fromIso || toIso;
  const to = toIso || fromIso;
  if (!from || !to) return;
  // Эффективные границы пересечения.
  const start = from < monthStartIso ? monthStartIso : from;
  const end = to > monthEndIso ? monthEndIso : to;
  if (start > end) return;
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate || !endDate) return;
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    cb(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
}

// ---------------------------------------------------------------
// Сборка сетки месяца (для рендера)
// ---------------------------------------------------------------

export interface CalendarCell {
  /** ISO-дата ячейки (даже для соседних месяцев). */
  iso: string;
  /** Номер дня (1..31). */
  day: number;
  /** Принадлежит ли ячейка отображаемому месяцу. */
  inMonth: boolean;
  /** Это сегодня? */
  isToday: boolean;
  /** Это суббота/воскресенье? */
  isWeekend: boolean;
}

/**
 * Возвращает 42-ячеечную сетку (6 недель × 7 дней) с понедельника первой
 * недели по воскресенье последней — как принято в RU-локали.
 */
export function buildMonthGrid(year: number, month: number, today: Date): CalendarCell[] {
  const monthStart = new Date(year, month, 1);
  // День недели: JS 0=Вс ... 6=Сб. Хотим Пн как первый день: shift = (jsDow + 6) % 7.
  const jsDow = monthStart.getDay();
  const offset = (jsDow + 6) % 7;
  const gridStart = new Date(year, month, 1 - offset);
  const todayIso = toIsoDate(today);

  const cells: CalendarCell[] = [];
  const cursor = new Date(gridStart);
  for (let i = 0; i < 42; i++) {
    const iso = toIsoDate(cursor);
    const dow = (cursor.getDay() + 6) % 7;
    cells.push({
      iso,
      day: cursor.getDate(),
      inMonth: cursor.getMonth() === month,
      isToday: iso === todayIso,
      isWeekend: dow >= 5,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}
