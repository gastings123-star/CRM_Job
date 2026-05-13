import { describe, expect, it } from 'vitest';
import {
  byPromotionReadiness,
  lowRated,
  overdueIpr,
  topSkills,
  upcomingIpr,
} from '@/domain/development';
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

describe('overdueIpr', () => {
  it('возвращает только записи с прошедшим дедлайном и status != выполнено', () => {
    const e = emp({
      id: 'e1',
      development: [
        { zone: 'A', status: 'в работе', deadline: '2026-04-01' }, // overdue
        { zone: 'B', status: 'выполнено', deadline: '2026-04-01' }, // done — skip
        { zone: 'C', status: 'в работе', deadline: '2026-06-01' }, // upcoming
        { zone: 'D', status: 'в работе', deadline: '' }, // no deadline
      ],
    });
    const r = overdueIpr([e], NOW);
    expect(r.length).toBe(1);
    expect(r[0]?.zone).toBe('A');
    expect(r[0]?.daysToDeadline).toBeLessThan(0);
  });

  it('сортирует по «насколько просрочено» (по возрастанию = сильнее просрочено внизу не нужно)', () => {
    const e = emp({
      id: 'e1',
      development: [
        { zone: 'recent', status: 'в работе', deadline: '2026-05-10' },
        { zone: 'old', status: 'в работе', deadline: '2025-01-01' },
      ],
    });
    const r = overdueIpr([e], NOW);
    expect(r[0]?.zone).toBe('old'); // сильнее просрочено — выше
    expect(r[1]?.zone).toBe('recent');
  });
});

describe('upcomingIpr', () => {
  it('берёт записи в окне [0..N]', () => {
    const e = emp({
      id: 'e1',
      development: [
        { zone: 'A', status: 'в работе', deadline: '2026-05-20' }, // через 7 дней
        { zone: 'B', status: 'в работе', deadline: '2026-07-20' }, // далеко
        { zone: 'C', status: 'выполнено', deadline: '2026-05-20' }, // done
      ],
    });
    const r = upcomingIpr([e], NOW, 30);
    expect(r.length).toBe(1);
    expect(r[0]?.zone).toBe('A');
  });
});

describe('byPromotionReadiness', () => {
  it('группирует сотрудников по всем 4 ключам', () => {
    const all = [
      emp({ id: 'a', promotionReadiness: 'готов сейчас' }),
      emp({ id: 'b', promotionReadiness: 'не готов' }),
      emp({ id: 'c', promotionReadiness: 'не готов' }),
      emp({ id: 'd', promotionReadiness: 'готов через 6 мес' }),
    ];
    const r = byPromotionReadiness(all);
    expect(r['готов сейчас']?.length).toBe(1);
    expect(r['не готов']?.length).toBe(2);
    expect(r['готов через 6 мес']?.length).toBe(1);
    expect(r['готов через год']?.length).toBe(0);
  });
});

describe('lowRated', () => {
  it('берёт только score < threshold и сортирует по возрастанию', () => {
    const all = [
      emp({ id: 'a', managerRating: { score: 2, comment: '' } }),
      emp({ id: 'b', managerRating: { score: 4, comment: '' } }),
      emp({ id: 'c', managerRating: { score: 1, comment: '' } }),
    ];
    const r = lowRated(all, 3);
    expect(r.map((e) => e.id)).toEqual(['c', 'a']);
  });
});

describe('topSkills', () => {
  it('считает суммарных носителей, экспертов и средний уровень', () => {
    const all = [
      emp({ id: 'a', skills: [{ name: 'SQL', level: 5 }, { name: 'JS', level: 3 }] }),
      emp({ id: 'b', skills: [{ name: 'SQL', level: 4 }, { name: 'JS', level: 2 }] }),
      emp({ id: 'c', skills: [{ name: 'JS', level: 5 }] }),
    ];
    const r = topSkills(all);
    const js = r.find((s) => s.name === 'JS');
    const sql = r.find((s) => s.name === 'SQL');
    expect(js?.total).toBe(3);
    expect(js?.experts).toBe(1); // только Карл (level=5) >= 4
    expect(js?.avgLevel).toBeCloseTo((3 + 2 + 5) / 3, 1);
    expect(sql?.experts).toBe(2);
  });

  it('сортирует по total → experts → имени', () => {
    const all = [
      emp({ id: 'a', skills: [{ name: 'B', level: 1 }] }),
      emp({ id: 'b', skills: [{ name: 'A', level: 1 }, { name: 'B', level: 1 }] }),
    ];
    const r = topSkills(all);
    expect(r[0]?.name).toBe('B'); // total=2
    expect(r[1]?.name).toBe('A'); // total=1
  });
});
