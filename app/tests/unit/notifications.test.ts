import { describe, it, expect } from 'vitest';
import { buildNotifications } from '@/domain/notifications';
import { EmployeeSchema, type Employee } from '@/data/schema';

const NOW = new Date(2026, 4, 8); // 2026-05-08

function emp(over: Partial<Employee> = {}): Employee {
  return EmployeeSchema.parse({
    id: 'e1',
    fullName: 'Иван',
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

describe('buildNotifications', () => {
  it('новый сотрудник без 1-on-1 → один yellow «не проводился»', () => {
    const n = buildNotifications([emp()], NOW);
    expect(n).toHaveLength(1);
    const [first] = n;
    expect(first?.color).toBe('yellow');
    expect(first?.id).toBe('o2o-never-e1');
  });

  it('просроченная задача → red', () => {
    const n = buildNotifications(
      [
        emp({
          tasks: [{ text: 'Тест', status: 'в работе', due: '2025-01-01' }],
        }),
      ],
      NOW,
    );
    const overdue = n.find((x) => x.id === 'task-overdue-e1-0');
    expect(overdue).toBeDefined();
    expect(overdue?.color).toBe('red');
  });

  it('задача через 5 дней → yellow', () => {
    const n = buildNotifications(
      [
        emp({
          tasks: [{ text: 'Тест', status: 'в работе', due: '2026-05-13' }],
        }),
      ],
      NOW,
    );
    const soon = n.find((x) => x.id === 'task-soon-e1-0');
    expect(soon).toBeDefined();
    expect(soon?.color).toBe('yellow');
  });

  it('ФОТ просрочен > 12 мес → red', () => {
    const n = buildNotifications([emp({ salaryReviewDate: '2024-01-01' })], NOW);
    expect(n.some((x) => x.id === 'fot-overdue-e1' && x.color === 'red')).toBe(true);
  });

  it('ФОТ через 9-12 мес → yellow', () => {
    const n = buildNotifications(
      [emp({ salaryReviewDate: '2025-07-01' })], // ~10 мес назад
      NOW,
    );
    expect(n.some((x) => x.id === 'fot-soon-e1' && x.color === 'yellow')).toBe(true);
  });

  it('высокий риск без комментария → red', () => {
    const n = buildNotifications([emp({ risk: { level: 'высокий', comment: '' } })], NOW);
    expect(n.some((x) => x.id === 'risk-no-comment-e1' && x.color === 'red')).toBe(true);
  });

  it('день рождения сегодня → blue', () => {
    const n = buildNotifications([emp({ birthday: '1990-05-08' })], NOW);
    expect(n.some((x) => x.id === 'bday-e1-2026' && x.color === 'blue')).toBe(true);
  });

  it('годовщина: формирует пункт с правильным склонением для 5 лет', () => {
    const n = buildNotifications(
      [emp({ hireDate: '2021-05-08' })], // 5 лет назад
      NOW,
    );
    const anniv = n.find((x) => x.id === 'anniv-e1-2026');
    expect(anniv).toBeDefined();
    expect(anniv?.text).toContain('5 лет');
  });

  it('1-on-1 запланирован сегодня → blue', () => {
    const n = buildNotifications(
      [
        emp({
          oneOnOne: {
            nextDate: '2026-05-08',
            prepNotes: '',
            history: [{ date: '2026-04-20' }], // не «никогда» и не >30 дней
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
      ],
      NOW,
    );
    expect(n.some((x) => x.id === 'o2o-today-e1' && x.color === 'blue')).toBe(true);
  });

  it('отпуск через 5 дней → yellow', () => {
    const n = buildNotifications(
      [
        emp({
          load: {
            currentDays: 0,
            currentPercent: 0,
            capacityQuarter: 0,
            capacityQtr: '',
            status: 'доступен',
            nextMonthPlan: 0,
            vacations: [{ from: '2026-05-13', to: '2026-05-20' }],
            sickLeaves: [],
            projects: [],
          },
        }),
      ],
      NOW,
    );
    expect(n.some((x) => x.id === 'vac-soon-e1-0' && x.color === 'yellow')).toBe(true);
  });
});
