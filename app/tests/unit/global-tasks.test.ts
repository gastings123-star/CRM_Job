import { describe, expect, it } from 'vitest';
import { applyFilter, buildGlobalTasks, sortByUrgency } from '@/domain/global-tasks';
import type { Employee } from '@/data/schema';

function emp(id: string, tasks: { text: string; status: string; due: string }[]): Employee {
  return {
    id,
    fullName: `Emp ${id}`,
    tasks,
    role: '',
    team: '',
    grade: 'Junior',
    email: '',
    hireDate: '',
    salaryReviewDate: '',
    salary: 0,
    employeeNumber: '',
    positionId: '',
    location: '',
    teams: '',
    telegram: '',
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
  } as unknown as Employee;
}

const NOW = new Date('2026-05-13T12:00:00Z');

describe('buildGlobalTasks', () => {
  it('собирает плоский список и считает daysToDue', () => {
    const all = [
      emp('a', [
        { text: 'A1', status: 'в работе', due: '2026-05-20' }, // +7
        { text: 'A2', status: 'выполнена', due: '2026-05-01' }, // done
      ]),
      emp('b', [{ text: 'B1', status: 'в работе', due: '' }]), // без даты
    ];
    const r = buildGlobalTasks(all, NOW);
    expect(r.length).toBe(3);
    const a1 = r.find((x) => x.text === 'A1');
    expect(a1?.daysToDue).toBe(7);
    expect(a1?.done).toBe(false);
    const a2 = r.find((x) => x.text === 'A2');
    expect(a2?.done).toBe(true);
    const b1 = r.find((x) => x.text === 'B1');
    expect(b1?.daysToDue).toBeNull();
  });
});

describe('applyFilter', () => {
  const rows = [
    { empId: 'a', empName: 'A', index: 0, text: 'overdue', status: 'в работе', due: '2026-05-01', daysToDue: -12, done: false },
    { empId: 'a', empName: 'A', index: 1, text: 'soon', status: 'в работе', due: '2026-05-15', daysToDue: 2, done: false },
    { empId: 'b', empName: 'B', index: 0, text: 'far', status: 'в работе', due: '2026-12-01', daysToDue: 200, done: false },
    { empId: 'b', empName: 'B', index: 1, text: 'no-due', status: 'не начата', due: '', daysToDue: null, done: false },
    { empId: 'c', empName: 'C', index: 0, text: 'done', status: 'выполнена', due: '2026-05-20', daysToDue: 7, done: true },
  ];

  it('open: всё кроме done', () => {
    expect(applyFilter(rows, 'open').map((r) => r.text)).toEqual([
      'overdue',
      'soon',
      'far',
      'no-due',
    ]);
  });
  it('overdue: только просроченные не-done', () => {
    expect(applyFilter(rows, 'overdue').map((r) => r.text)).toEqual(['overdue']);
  });
  it('upcoming-7: 0..7 дней, не-done', () => {
    expect(applyFilter(rows, 'upcoming-7').map((r) => r.text)).toEqual(['soon']);
  });
  it('no-due: без дедлайна, не-done', () => {
    expect(applyFilter(rows, 'no-due').map((r) => r.text)).toEqual(['no-due']);
  });
  it('done: только выполненные', () => {
    expect(applyFilter(rows, 'done').map((r) => r.text)).toEqual(['done']);
  });
});

describe('sortByUrgency', () => {
  it('overdue → soon → far → no-due → done', () => {
    const rows = [
      { empId: 'a', empName: 'A', index: 0, text: 'done', status: 'выполнена', due: '2026-05-20', daysToDue: 7, done: true },
      { empId: 'a', empName: 'A', index: 1, text: 'no-due', status: 'не начата', due: '', daysToDue: null, done: false },
      { empId: 'b', empName: 'B', index: 0, text: 'far', status: 'в работе', due: '2026-12-01', daysToDue: 200, done: false },
      { empId: 'b', empName: 'B', index: 1, text: 'overdue', status: 'в работе', due: '2026-05-01', daysToDue: -12, done: false },
      { empId: 'c', empName: 'C', index: 0, text: 'soon', status: 'в работе', due: '2026-05-15', daysToDue: 2, done: false },
    ];
    expect(sortByUrgency(rows).map((r) => r.text)).toEqual([
      'overdue',
      'soon',
      'far',
      'no-due',
      'done',
    ]);
  });
});
