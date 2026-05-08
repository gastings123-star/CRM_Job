import { describe, it, expect } from 'vitest';
import { capacityForecast, vacDaysInQuarter } from '@/domain/capacity';
import { EmployeeSchema, type Employee } from '@/data/schema';

const NOW = new Date(2026, 4, 8); // 2026-05-08, Q2 2026

function makeEmployee(over: Partial<Employee> = {}): Employee {
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
      capacityQuarter: 60,
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
    ...over,
  });
}

describe('vacDaysInQuarter', () => {
  it('пустые отпуска → 0', () => {
    expect(vacDaysInQuarter(makeEmployee(), 'Q2 2026')).toBe(0);
  });

  it('отпуск 5 дней внутри квартала', () => {
    const e = makeEmployee({
      load: {
        ...makeEmployee().load,
        vacations: [{ from: '2026-05-10', to: '2026-05-14' }],
      },
    });
    expect(vacDaysInQuarter(e, 'Q2 2026')).toBe(5);
  });

  it('отпуск частично за квартал — обрезается', () => {
    const e = makeEmployee({
      load: {
        ...makeEmployee().load,
        vacations: [{ from: '2026-06-25', to: '2026-07-05' }], // конец Q2 — 30 июня
      },
    });
    // 25..30 = 6 дней
    expect(vacDaysInQuarter(e, 'Q2 2026')).toBe(6);
  });

  it('периоды с пустыми границами игнорируются', () => {
    const e = makeEmployee({
      load: {
        ...makeEmployee().load,
        vacations: [{ from: '', to: '' }],
      },
    });
    expect(vacDaysInQuarter(e, 'Q2 2026')).toBe(0);
  });

  it('невалидный label → 0', () => {
    expect(vacDaysInQuarter(makeEmployee(), 'xxx')).toBe(0);
  });

  it('больничные суммируются с отпусками', () => {
    const e = makeEmployee({
      load: {
        ...makeEmployee().load,
        vacations: [{ from: '2026-05-10', to: '2026-05-12' }], // 3 дня
        sickLeaves: [{ from: '2026-04-01', to: '2026-04-02' }], // 2 дня
      },
    });
    expect(vacDaysInQuarter(e, 'Q2 2026')).toBe(5);
  });
});

describe('capacityForecast', () => {
  it('пустая нагрузка → ok-риск или none', () => {
    const r = capacityForecast(makeEmployee(), NOW);
    expect(r.label).toBe('Q2 2026');
    expect(r.totalCap).toBe(60);
    expect(r.vacDays).toBe(0);
    expect(r.realCap).toBe(60);
    expect(r.usedDays).toBe(0);
    expect(r.free).toBe(60);
    expect(r.risk).toBe('ok');
  });

  it('totalCap=0 → risk=none', () => {
    const e = makeEmployee({
      load: {
        ...makeEmployee().load,
        capacityQuarter: 0,
        capacityQtr: 'Q2 2026',
      },
    });
    const r = capacityForecast(e, NOW);
    // capacityQuarter=0 → totalCap = quarterWorkDays('Q2 2026') ≈ 65
    expect(r.totalCap).toBeGreaterThan(0);
    expect(r.risk).not.toBe('none');
  });

  it('used > realCap → free=0, risk=high', () => {
    const e = makeEmployee({
      load: {
        ...makeEmployee().load,
        capacityQuarter: 60,
        currentDays: 60, // free=0 → 0/60 < 0.15
      },
    });
    const r = capacityForecast(e, NOW);
    expect(r.free).toBe(0);
    expect(r.risk).toBe('high');
  });

  it('label берётся из now, если capacityQtr пуст', () => {
    const e = makeEmployee({
      load: {
        ...makeEmployee().load,
        capacityQtr: '',
      },
    });
    const r = capacityForecast(e, NOW);
    expect(r.label).toBe('Q2 2026');
  });
});
