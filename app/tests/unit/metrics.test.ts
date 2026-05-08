import { describe, it, expect } from 'vitest';
import { busFactor, overdueDensity } from '@/domain/metrics';
import { EmployeeSchema, type Employee } from '@/data/schema';

const NOW = new Date(2026, 4, 8); // 2026-05-08

function emp(over: Partial<Employee> = {}): Employee {
  return EmployeeSchema.parse({
    id: 'e' + Math.random(),
    fullName: '',
    role: '',
    team: '',
    hireDate: '',
    salaryReviewDate: '',
    load: {
      currentDays: 0,
      currentPercent: 0,
      capacityQuarter: 0,
      capacityQtr: '',
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

describe('busFactor', () => {
  it('пустой массив → 0', () => {
    expect(busFactor([])).toBe(0);
  });

  it('сотрудник без сильных навыков → попадает в счётчик', () => {
    expect(busFactor([emp({ skills: [{ name: 'a', level: 2 }] })])).toBe(1);
  });

  it('сотрудник с двумя навыками 4+ → не попадает', () => {
    expect(
      busFactor([
        emp({
          skills: [
            { name: 'a', level: 4 },
            { name: 'b', level: 5 },
          ],
        }),
      ]),
    ).toBe(0);
  });

  it('один навык 4+ → попадает', () => {
    expect(
      busFactor([
        emp({
          skills: [
            { name: 'a', level: 5 },
            { name: 'b', level: 2 },
          ],
        }),
      ]),
    ).toBe(1);
  });
});

describe('overdueDensity', () => {
  it('пустой → 0', () => {
    expect(overdueDensity([], NOW)).toBe(0);
  });

  it('1 просроченная из 2 → 50', () => {
    const e = emp({
      tasks: [
        { text: 'a', status: 'в работе', due: '2025-01-01' }, // просрочена
        { text: 'b', status: 'в работе', due: '2027-01-01' }, // нет
      ],
    });
    expect(overdueDensity([e], NOW)).toBe(50);
  });

  it('выполненные не учитываются', () => {
    const e = emp({
      tasks: [
        { text: 'a', status: 'выполнена', due: '2020-01-01' },
        { text: 'b', status: 'в работе', due: '2027-01-01' },
      ],
    });
    expect(overdueDensity([e], NOW)).toBe(0);
  });

  it('задача без due → не просрочена', () => {
    const e = emp({
      tasks: [{ text: 'a', status: 'в работе', due: '' }],
    });
    expect(overdueDensity([e], NOW)).toBe(0);
  });
});
