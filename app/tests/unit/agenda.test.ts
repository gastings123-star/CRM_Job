import { describe, it, expect } from 'vitest';
import { buildAutoAgenda } from '@/domain/agenda';
import { EmployeeSchema, type Employee } from '@/data/schema';

const NOW = new Date(2026, 4, 8); // 2026-05-08

function emp(over: Partial<Employee> = {}): Employee {
  return EmployeeSchema.parse({
    id: 'e1',
    fullName: 'X',
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

describe('buildAutoAgenda', () => {
  it('идеальный сотрудник → пустая повестка', () => {
    expect(buildAutoAgenda(emp(), NOW)).toEqual([]);
  });

  it('ФОТ ≥ 10 мес → пункт о пересмотре', () => {
    const items = buildAutoAgenda(
      emp({ salaryReviewDate: '2025-06-01' }), // ~11 мес
      NOW,
    );
    expect(items.some((s) => s.includes('ФОТ'))).toBe(true);
  });

  it('загрузка > 90% → пункт о приоритетах', () => {
    const items = buildAutoAgenda(
      emp({
        load: { ...emp().load, currentPercent: 95 },
      }),
      NOW,
    );
    expect(items.some((s) => s.includes('Загрузка'))).toBe(true);
  });

  it('просроченные задачи попадают в повестку', () => {
    const items = buildAutoAgenda(
      emp({
        tasks: [{ text: 'a', status: 'в работе', due: '2025-01-01' }],
      }),
      NOW,
    );
    expect(items.some((s) => s.includes('Просроченные задачи'))).toBe(true);
  });

  it('готов к повышению → пункт о плане', () => {
    const items = buildAutoAgenda(emp({ promotionReadiness: 'готов сейчас' }), NOW);
    expect(items.some((s) => s.includes('повышению'))).toBe(true);
  });

  it('просроченные ИПР перечисляются с зонами', () => {
    const items = buildAutoAgenda(
      emp({
        development: [
          { zone: 'Архитектура', status: 'в работе', deadline: '2025-01-01' },
          { zone: 'Soft skills', status: 'в работе', deadline: '2025-02-01' },
        ],
      }),
      NOW,
    );
    expect(items.some((s) => s.includes('Архитектура') && s.includes('Soft skills'))).toBe(true);
  });
});
