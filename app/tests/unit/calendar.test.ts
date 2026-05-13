import { describe, expect, it } from 'vitest';
import { buildMonthEvents, buildMonthGrid } from '@/domain/calendar';
import type { Employee } from '@/data/schema';

function emp(over: Partial<Employee> = {}): Employee {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    fullName: over.fullName ?? 'X',
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

describe('buildMonthGrid', () => {
  it('возвращает 42 ячейки с понедельника по воскресенье', () => {
    // Май 2026 (1 мая 2026 — пятница). Сетка должна стартовать с понедельника 27 апреля.
    const cells = buildMonthGrid(2026, 4, new Date(2026, 4, 13));
    expect(cells.length).toBe(42);
    expect(cells[0]?.iso).toBe('2026-04-27');
    // первая ячейка месяца — 1 мая на 5-й позиции (индекс 4)
    const may1 = cells.find((c) => c.iso === '2026-05-01');
    expect(may1?.inMonth).toBe(true);
    expect(may1?.day).toBe(1);
    expect(may1?.isWeekend).toBe(false); // 1 мая = пятница
  });

  it('отмечает «сегодня» и выходные', () => {
    const cells = buildMonthGrid(2026, 4, new Date(2026, 4, 13));
    const today = cells.find((c) => c.iso === '2026-05-13');
    expect(today?.isToday).toBe(true);
    const sat = cells.find((c) => c.iso === '2026-05-02');
    const sun = cells.find((c) => c.iso === '2026-05-03');
    expect(sat?.isWeekend).toBe(true);
    expect(sun?.isWeekend).toBe(true);
  });

  it('ячейки соседних месяцев помечены inMonth=false', () => {
    const cells = buildMonthGrid(2026, 4, new Date(2026, 4, 13));
    expect(cells[0]?.inMonth).toBe(false); // 2026-04-27
    expect(cells[cells.length - 1]?.inMonth).toBe(false); // 2026-06-07
  });
});

describe('buildMonthEvents', () => {
  it('отпуск раскладывается по всем дням пересечения с месяцем', () => {
    const e = emp({
      id: 'e1',
      fullName: 'A',
      load: {
        currentDays: 0,
        currentPercent: 0,
        capacityQuarter: 0,
        capacityQtr: '',
        status: 'в отпуске',
        nextMonthPlan: 0,
        vacations: [{ from: '2026-04-28', to: '2026-05-05' }],
        sickLeaves: [],
        projects: [],
      },
    });
    const events = buildMonthEvents([e], 2026, 4); // май
    // 1-5 мая включительно — 5 событий «vacation» для одного сотрудника
    const days = [...events.entries()]
      .filter(([, list]) => list.some((ev) => ev.kind === 'vacation'))
      .map(([iso]) => iso)
      .sort();
    expect(days).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
      '2026-05-04',
      '2026-05-05',
    ]);
  });

  it('день рождения повторяется каждый год', () => {
    const e = emp({ id: 'e1', fullName: 'A', birthday: '1990-05-13' });
    const may = buildMonthEvents([e], 2026, 4);
    expect(may.get('2026-05-13')?.some((ev) => ev.kind === 'birthday')).toBe(true);
    // в апреле — нет
    const apr = buildMonthEvents([e], 2026, 3);
    expect(apr.get('2026-04-13')).toBeUndefined();
  });

  it('годовщина найма — только если уже прошёл год', () => {
    const e1 = emp({ id: 'e1', fullName: 'OldTimer', hireDate: '2019-05-10' });
    const e2 = emp({ id: 'e2', fullName: 'Newbie', hireDate: '2026-05-10' });
    const may = buildMonthEvents([e1, e2], 2026, 4);
    const list = may.get('2026-05-10') ?? [];
    expect(list.some((ev) => ev.kind === 'hire' && ev.empId === 'e1')).toBe(true);
    // Newbie не должен — в год найма ещё нет годовщины.
    expect(list.some((ev) => ev.kind === 'hire' && ev.empId === 'e2')).toBe(false);
  });

  it('1-on-1 и просроченная задача попадают в события дня', () => {
    const e = emp({
      id: 'e1',
      fullName: 'A',
      oneOnOne: {
        nextDate: '2026-05-15',
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
      tasks: [{ text: 'Деплой', status: 'в работе', due: '2026-05-20' }],
    });
    const may = buildMonthEvents([e], 2026, 4);
    expect(may.get('2026-05-15')?.some((ev) => ev.kind === 'oneonone')).toBe(true);
    expect(may.get('2026-05-20')?.some((ev) => ev.kind === 'taskDue')).toBe(true);
  });

  it('выполненные задачи не отображаются', () => {
    const e = emp({
      id: 'e1',
      tasks: [{ text: 'Done', status: 'выполнена', due: '2026-05-20' }],
    });
    const may = buildMonthEvents([e], 2026, 4);
    expect(may.get('2026-05-20')).toBeUndefined();
  });
});
