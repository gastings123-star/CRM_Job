import { describe, expect, it } from 'vitest';
import { countMatching, daysSinceLastOneOnOne, SMART_LISTS } from '@/domain/crm-lists';
import type { Employee } from '@/data/schema';

function emp(over: Partial<Employee> = {}): Employee {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    fullName: 'X',
    role: '',
    team: '',
    hireDate: '',
    salaryReviewDate: '',
    salary: 0,
    employeeNumber: '',
    positionId: '',
    location: '',
    email: '',
    teams: '',
    telegram: '',
    grade: 'Junior',
    birthday: '',
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
    projectHistory: [],
    salaryHistory: [],
    hobbies: '',
    managerComments: [],
    documents: [],
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
    teamHistory: [],
    ...over,
  } as unknown as Employee;
}

const NOW = new Date('2026-05-13T12:00:00Z');

function pick(id: 'all' | 'high-risk' | 'ready-now' | 'no-1on1-30' | 'fot-overdue' | 'overload') {
  const l = SMART_LISTS.find((x) => x.id === id);
  if (!l) throw new Error(`No list: ${id}`);
  return l;
}

describe('SMART_LISTS', () => {
  it('«Все» включает всех', () => {
    expect(countMatching([emp(), emp(), emp()], pick('all'), NOW)).toBe(3);
  });

  it('«Готовы к повышению» — только promotionReadiness=готов сейчас', () => {
    const list = [
      emp({ promotionReadiness: 'готов сейчас' }),
      emp({ promotionReadiness: 'готов через 6 мес' }),
      emp({ promotionReadiness: 'не готов' }),
    ];
    expect(countMatching(list, pick('ready-now'), NOW)).toBe(1);
  });

  it('«ФОТ просрочен» — monthsSince > 12', () => {
    const list = [
      emp({ salaryReviewDate: '2024-01-01' }), // ~16 мес
      emp({ salaryReviewDate: '2026-01-01' }), // ~4 мес
      emp({ salaryReviewDate: '' }), // нет даты
    ];
    expect(countMatching(list, pick('fot-overdue'), NOW)).toBe(1);
  });

  it('«Без 1-on-1 > 30 дней» — никогда или >30', () => {
    const list = [
      emp(), // никогда → попадает
      emp({
        oneOnOne: {
          nextDate: '',
          prepNotes: '',
          history: [{ date: '2026-05-01' }], // 12 дней назад
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
      emp({
        oneOnOne: {
          nextDate: '',
          prepNotes: '',
          history: [{ date: '2026-03-01' }], // ~73 дня назад
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
    ];
    expect(countMatching(list, pick('no-1on1-30'), NOW)).toBe(2);
  });

  it('«Перегрузка >100%» — currentPercent > 100', () => {
    const list = [
      emp({
        load: {
          currentDays: 0,
          currentPercent: 130,
          capacityQuarter: 0,
          capacityQtr: '',
          status: 'занят',
          nextMonthPlan: 0,
          vacations: [],
          sickLeaves: [],
          projects: [],
        },
      }),
      emp({
        load: {
          currentDays: 0,
          currentPercent: 100,
          capacityQuarter: 0,
          capacityQtr: '',
          status: 'занят',
          nextMonthPlan: 0,
          vacations: [],
          sickLeaves: [],
          projects: [],
        },
      }),
    ];
    expect(countMatching(list, pick('overload'), NOW)).toBe(1);
  });
});

describe('daysSinceLastOneOnOne', () => {
  it('возвращает null, если ни разу не проводился', () => {
    expect(daysSinceLastOneOnOne(emp(), NOW)).toBeNull();
  });

  it('считает дни с последней записи', () => {
    const e = emp({
      oneOnOne: {
        nextDate: '',
        prepNotes: '',
        history: [{ date: '2026-05-06' }], // 7 дней назад
        agendaChecklist: {
          feedback: false,
          goals: false,
          load: false,
          growth: false,
          wellbeing: false,
        },
        agendaExtra: '',
      },
    });
    expect(daysSinceLastOneOnOne(e, NOW)).toBe(7);
  });
});
