import { describe, expect, it } from 'vitest';
import {
  currentStreak,
  escalationsWindow,
  findSnapshot,
  mondayOf,
  recentWeeks,
  snapshotsForTeam,
  sparklineData,
  sparklinePath,
  tailSlope,
} from '@/domain/pulse';
import type { TeamPulseSnapshot } from '@/data/schema';

function snap(over: Partial<TeamPulseSnapshot>): TeamPulseSnapshot {
  return {
    id: Math.random().toString(36).slice(2),
    teamId: 't1',
    weekStart: '2026-05-11',
    status: 'green',
    tailIndex: 0,
    escalations: 0,
    escalationKind: null,
    note: '',
    ...over,
  };
}

describe('mondayOf', () => {
  it('среда → понедельник той же недели', () => {
    expect(mondayOf(new Date('2026-05-13T12:00:00Z'))).toBe('2026-05-11');
  });
  it('воскресенье → понедельник прошлого дня (та же ISO-неделя)', () => {
    expect(mondayOf(new Date('2026-05-17T12:00:00Z'))).toBe('2026-05-11');
  });
});

describe('recentWeeks', () => {
  it('возвращает N понедельников по возрастанию, заканчивая текущим', () => {
    const ws = recentWeeks(new Date('2026-05-13'), 4);
    expect(ws.length).toBe(4);
    expect(ws[ws.length - 1]).toBe('2026-05-11');
    // ровно по 7 дней назад
    expect(ws[0]).toBe('2026-04-20');
  });
});

describe('snapshotsForTeam', () => {
  it('фильтрует по teamId и сортирует по weekStart asc', () => {
    const all = [
      snap({ teamId: 't1', weekStart: '2026-05-04' }),
      snap({ teamId: 't2', weekStart: '2026-05-04' }),
      snap({ teamId: 't1', weekStart: '2026-04-27' }),
    ];
    const r = snapshotsForTeam(all, 't1');
    expect(r.length).toBe(2);
    expect(r[0]!.weekStart).toBe('2026-04-27');
    expect(r[1]!.weekStart).toBe('2026-05-04');
  });
});

describe('currentStreak', () => {
  it('пусто → 0', () => {
    expect(currentStreak([])).toEqual({ status: null, weeks: 0 });
  });
  it('считает подряд от последнего', () => {
    const list = [
      snap({ weekStart: '2026-04-20', status: 'green' }),
      snap({ weekStart: '2026-04-27', status: 'yellow' }),
      snap({ weekStart: '2026-05-04', status: 'yellow' }),
      snap({ weekStart: '2026-05-11', status: 'yellow' }),
    ];
    expect(currentStreak(list)).toEqual({ status: 'yellow', weeks: 3 });
  });
  it('одна запись', () => {
    expect(currentStreak([snap({ status: 'red' })])).toEqual({ status: 'red', weeks: 1 });
  });
});

describe('escalationsWindow', () => {
  it('суммирует escalations внутри окна', () => {
    const list = [
      snap({ weekStart: '2026-04-13', escalations: 5 }), // вне 4w-окна
      snap({ weekStart: '2026-04-20', escalations: 2 }),
      snap({ weekStart: '2026-04-27', escalations: 1 }),
      snap({ weekStart: '2026-05-04', escalations: 0 }),
      snap({ weekStart: '2026-05-11', escalations: 3 }),
    ];
    expect(escalationsWindow(list, new Date('2026-05-13'), 4)).toBe(2 + 1 + 0 + 3);
  });
});

describe('tailSlope', () => {
  it('возрастающий ряд → положительный slope', () => {
    const list = [
      snap({ weekStart: '2026-04-20', tailIndex: 1 }),
      snap({ weekStart: '2026-04-27', tailIndex: 3 }),
      snap({ weekStart: '2026-05-04', tailIndex: 5 }),
      snap({ weekStart: '2026-05-11', tailIndex: 7 }),
    ];
    expect(tailSlope(list, new Date('2026-05-13'), 4)).toBeCloseTo(2, 1);
  });
  it('одна точка → 0', () => {
    const list = [snap({ weekStart: '2026-05-11', tailIndex: 5 })];
    expect(tailSlope(list, new Date('2026-05-13'), 4)).toBe(0);
  });
});

describe('sparklineData', () => {
  it('возвращает N точек с пустыми пропусками', () => {
    const list = [
      snap({ weekStart: '2026-05-04', tailIndex: 4, status: 'yellow' }),
      snap({ weekStart: '2026-05-11', tailIndex: 6, status: 'red' }),
    ];
    const r = sparklineData(list, new Date('2026-05-13'), 4);
    expect(r.length).toBe(4);
    expect(r[0]!.value).toBeNull();
    expect(r[r.length - 1]!.value).toBe(6);
    expect(r[r.length - 1]!.status).toBe('red');
  });
});

describe('sparklinePath', () => {
  it('строит path только по непустым точкам', () => {
    const pts = [
      { weekStart: 'a', value: null, status: null },
      { weekStart: 'b', value: 5, status: 'green' as const },
      { weekStart: 'c', value: 10, status: 'red' as const },
    ];
    const d = sparklinePath(pts, 100, 50);
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('L');
  });
  it('пустые точки → пустая строка', () => {
    expect(sparklinePath([{ weekStart: 'a', value: null, status: null }], 100, 50)).toBe('');
  });
});

describe('findSnapshot', () => {
  it('точное совпадение teamId+weekStart', () => {
    const list = [
      snap({ teamId: 't1', weekStart: '2026-05-11' }),
      snap({ teamId: 't1', weekStart: '2026-05-04' }),
    ];
    expect(findSnapshot(list, 't1', '2026-05-04')!.weekStart).toBe('2026-05-04');
    expect(findSnapshot(list, 't1', '2026-05-18')).toBeUndefined();
  });
});
