import { describe, it, expect } from 'vitest';
import {
  daysInMonth,
  monthDiff,
  dayDiff,
  parseIsoDate,
  toIsoDate,
  monthsSince,
  tenureMonths,
  quarterLabel,
  parseQuarterLabel,
  quarterMonths,
  quarterEnd,
  quarterWorkDays,
  overlapsPeriod,
  startOfWeek,
} from '@/domain/dates';

describe('daysInMonth', () => {
  it('возвращает 31 для января', () => {
    expect(daysInMonth(2025, 0)).toBe(31);
  });
  it('учитывает високосный год', () => {
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2025, 1)).toBe(28);
  });
});

describe('monthDiff / dayDiff', () => {
  it('одинаковая дата = 0', () => {
    const d = new Date(2025, 5, 15);
    expect(monthDiff(d, d)).toBe(0);
    expect(dayDiff(d, d)).toBe(0);
  });
  it('разница 12 для одного года', () => {
    expect(monthDiff(new Date(2024, 0, 1), new Date(2025, 0, 1))).toBe(12);
  });
  it('dayDiff: 7 дней', () => {
    expect(dayDiff(new Date(2025, 0, 1), new Date(2025, 0, 8))).toBe(7);
  });
});

describe('parseIsoDate / toIsoDate', () => {
  it('пустая строка → null', () => {
    expect(parseIsoDate('')).toBeNull();
  });
  it('невалидная строка → null', () => {
    expect(parseIsoDate('not-a-date')).toBeNull();
  });
  it('YYYY-MM-DD парсится', () => {
    const d = parseIsoDate('2026-05-08');
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
  });
  it('toIsoDate форматирует', () => {
    expect(toIsoDate(new Date(2026, 4, 8))).toBe('2026-05-08');
  });
});

describe('monthsSince / tenureMonths', () => {
  const now = new Date(2026, 4, 8); // 2026-05-08
  it('пустая ISO-дата → -1', () => {
    expect(monthsSince('', now)).toBe(-1);
    expect(tenureMonths('', now)).toBe(-1);
  });
  it('5 месяцев назад', () => {
    expect(monthsSince('2025-12-08', now)).toBe(5);
  });
  it('тот же месяц → 0', () => {
    expect(monthsSince('2026-05-01', now)).toBe(0);
  });
});

describe('quarterLabel / parseQuarterLabel', () => {
  it('Q2 для мая', () => {
    expect(quarterLabel(new Date(2026, 4, 8))).toBe('Q2 2026');
  });
  it('Q4 для декабря', () => {
    expect(quarterLabel(new Date(2026, 11, 31))).toBe('Q4 2026');
  });
  it('parseQuarterLabel валидный', () => {
    expect(parseQuarterLabel('Q3 2026')).toEqual({ q: 3, year: 2026 });
  });
  it('parseQuarterLabel невалидный', () => {
    expect(parseQuarterLabel('xxx')).toBeNull();
    expect(parseQuarterLabel('Q5 2026')).toBeNull();
  });
});

describe('quarterMonths / quarterEnd / quarterWorkDays', () => {
  it('Q1 2026 → январь, февраль, март', () => {
    const m = quarterMonths('Q1 2026');
    expect(m.map((d) => d.getMonth())).toEqual([0, 1, 2]);
    expect(m.every((d) => d.getDate() === 1)).toBe(true);
  });
  it('quarterEnd Q1 2026 → 31 марта', () => {
    const e = quarterEnd('Q1 2026');
    expect(e?.getMonth()).toBe(2);
    expect(e?.getDate()).toBe(31);
  });
  it('quarterWorkDays > 60 для любого квартала', () => {
    expect(quarterWorkDays('Q1 2026')).toBeGreaterThan(60);
    expect(quarterWorkDays('Q2 2026')).toBeGreaterThan(60);
  });
  it('невалидный label → 0', () => {
    expect(quarterWorkDays('xxx')).toBe(0);
    expect(quarterMonths('xxx')).toEqual([]);
    expect(quarterEnd('xxx')).toBeNull();
  });
});

describe('overlapsPeriod', () => {
  const d = (y: number, m: number, day: number) => new Date(y, m, day);
  it('пересекаются', () => {
    expect(overlapsPeriod(d(2026, 0, 1), d(2026, 0, 10), d(2026, 0, 5), d(2026, 0, 15))).toBe(true);
  });
  it('не пересекаются', () => {
    expect(overlapsPeriod(d(2026, 0, 1), d(2026, 0, 5), d(2026, 0, 6), d(2026, 0, 10))).toBe(false);
  });
  it('касаются границей — считаются пересекающимися', () => {
    expect(overlapsPeriod(d(2026, 0, 1), d(2026, 0, 5), d(2026, 0, 5), d(2026, 0, 10))).toBe(true);
  });
});

describe('startOfWeek', () => {
  it('понедельник остаётся понедельником', () => {
    const mon = new Date(2026, 4, 4); // 2026-05-04 — понедельник
    expect(startOfWeek(mon).getDay()).toBe(1);
    expect(toIsoDate(startOfWeek(mon))).toBe('2026-05-04');
  });
  it('воскресенье уезжает в предыдущий понедельник', () => {
    const sun = new Date(2026, 4, 10); // 2026-05-10 — воскресенье
    expect(toIsoDate(startOfWeek(sun))).toBe('2026-05-04');
  });
});
