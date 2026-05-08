import { describe, it, expect } from 'vitest';
import { daysInMonth, monthDiff } from '@/domain/dates';

describe('daysInMonth', () => {
  it('возвращает 31 для января', () => {
    expect(daysInMonth(2025, 0)).toBe(31);
  });
  it('учитывает високосный год', () => {
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2025, 1)).toBe(28);
  });
});

describe('monthDiff', () => {
  it('одинаковая дата = 0', () => {
    const d = new Date(2025, 5, 15);
    expect(monthDiff(d, d)).toBe(0);
  });
  it('разница 12 для одного года', () => {
    expect(monthDiff(new Date(2024, 0, 1), new Date(2025, 0, 1))).toBe(12);
  });
});
