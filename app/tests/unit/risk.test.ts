import { describe, it, expect } from 'vitest';
import { calcRiskScore, riskBadge } from '@/domain/risk';
import { EmployeeSchema, type Employee } from '@/data/schema';

const NOW = new Date(2026, 4, 8); // 2026-05-08

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  // Минимально валидный сотрудник; partial-перекрытия для каждого теста.
  return EmployeeSchema.parse({
    id: 'e1',
    fullName: 'Test',
    role: '',
    team: '',
    hireDate: '',
    salaryReviewDate: '',
    load: {
      currentDays: 0,
      currentPercent: 0,
      capacityQuarter: 0,
      capacityQtr: 'Q2 2026',
      status: 'доступен',
      nextMonthPlan: 0,
      vacations: [],
      sickLeaves: [],
      projects: [],
    },
    skills: [],
    development: [],
    managerRating: { score: 3, comment: '' },
    risk: { level: 'низкий', comment: '' },
    promotionReadiness: 'не готов',
    workPreference: 'гибрид',
    tasks: [],
    oneOnOne: {
      nextDate: '',
      prepNotes: '',
      history: [],
      agendaChecklist: {
        feedback: false,
        goals: false,
        load: false,
        growth: false,
        wellbeing: false,
      },
      agendaExtra: '',
    },
    goalsCurrentPeriod: '',
    goals: [],
    goalsSummary: { score: 3, comment: '', date: '' },
    ...overrides,
  });
}

describe('calcRiskScore', () => {
  it('базовый сотрудник без 1-on-1 в истории → 20 (legacy: пустая история = «никогда»)', () => {
    // Соответствует legacy: lastOoo='' трактуется как 9999 дней без встречи.
    const r = calcRiskScore(makeEmployee(), NOW);
    expect(r.score).toBe(20);
    expect(r.level).toBe('low');
    expect(r.drivers).toEqual(['1-on-1 не было никогда']);
  });

  it('сотрудник с недавним 1-on-1 → score 0, low, нет драйверов', () => {
    const r = calcRiskScore(
      makeEmployee({
        oneOnOne: {
          nextDate: '',
          prepNotes: '',
          history: [{ date: '2026-04-25' }], // 13 дней назад от 2026-05-08
          agendaChecklist: {
            feedback: false,
            goals: false,
            load: false,
            growth: false,
            wellbeing: false,
          },
          agendaExtra: '',
        },
      }),
      NOW,
    );
    expect(r.score).toBe(0);
    expect(r.level).toBe('low');
    expect(r.drivers).toEqual([]);
  });

  it('просроченный ФОТ > 12 мес даёт +30', () => {
    const r = calcRiskScore(
      makeEmployee({ salaryReviewDate: '2024-01-01' }), // ~16 мес назад
      NOW,
    );
    expect(r.score).toBeGreaterThanOrEqual(30);
    expect(r.drivers.some((d) => d.includes('ФОТ'))).toBe(true);
  });

  it('перегрузка 110% даёт +25', () => {
    const r = calcRiskScore(
      makeEmployee({
        load: {
          currentDays: 22,
          currentPercent: 110,
          capacityQuarter: 20,
          capacityQtr: 'Q2 2026',
          status: 'занят',
          nextMonthPlan: 90,
          vacations: [],
          sickLeaves: [],
          projects: [],
        },
      }),
      NOW,
    );
    expect(r.score).toBeGreaterThanOrEqual(25);
    expect(r.drivers.some((d) => d.includes('Перегрузка'))).toBe(true);
  });

  it('1-on-1 никогда не было → драйвер «никогда»', () => {
    const r = calcRiskScore(makeEmployee(), NOW);
    // Нет history — ooodays=9999, попадает в > 60.
    expect(r.drivers.some((d) => d.includes('никогда'))).toBe(true);
  });

  it('1-on-1 был 45 дней назад → попадает в средний порог', () => {
    const r = calcRiskScore(
      makeEmployee({
        oneOnOne: {
          nextDate: '',
          prepNotes: '',
          history: [{ date: '2026-03-24' }], // 45 дней назад от 2026-05-08
          agendaChecklist: {
            feedback: false,
            goals: false,
            load: false,
            growth: false,
            wellbeing: false,
          },
          agendaExtra: '',
        },
      }),
      NOW,
    );
    expect(r.drivers.some((d) => /1-on-1 4[0-9] дней назад/.test(d))).toBe(true);
  });

  it('низкая оценка руководителя ≤2 даёт +15', () => {
    const r = calcRiskScore(makeEmployee({ managerRating: { score: 2, comment: '' } }), NOW);
    expect(r.drivers.some((d) => d.includes('Низкая оценка'))).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(15);
  });

  it('score насыщается до 100', () => {
    // Все факторы одновременно
    const r = calcRiskScore(
      makeEmployee({
        salaryReviewDate: '2023-01-01',
        load: {
          currentDays: 25,
          currentPercent: 120,
          capacityQuarter: 20,
          capacityQtr: 'Q2 2026',
          status: 'занят',
          nextMonthPlan: 90,
          vacations: [],
          sickLeaves: [],
          projects: [],
        },
        development: [
          { zone: 'A', status: 'в работе', deadline: '2025-01-01' },
          { zone: 'B', status: 'в работе', deadline: '2025-01-01' },
        ],
        managerRating: { score: 1, comment: '' },
      }),
      NOW,
    );
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.level).toBe('high');
  });
});

describe('riskBadge', () => {
  it('возвращает корректный label по уровню', () => {
    expect(riskBadge('high', 75).label).toBe('Высокий');
    expect(riskBadge('medium', 45).label).toBe('Средний');
    expect(riskBadge('low', 10).label).toBe('Низкий');
  });
  it('пробрасывает score', () => {
    expect(riskBadge('high', 75).score).toBe(75);
  });
});
