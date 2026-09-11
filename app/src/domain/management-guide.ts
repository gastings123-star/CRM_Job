import type { Employee } from '@/data/schema';
import type { ManagementState } from '@/data/management';
import { iso, shift } from './management';

export interface GuideTarget {
  route:
    | 'management'
    | 'teams'
    | 'pulse'
    | 'tasks'
    | 'calendar'
    | 'development'
    | 'personal'
    | 'projects'
    | 'crm';
  area?: string;
  employeeId?: string;
  tab?: string;
}
export interface GuideItem {
  id: string;
  title: string;
  reason: string;
  target: GuideTarget;
  date?: string;
}
export interface WorkSlot {
  start: number;
  end: number;
  time: string;
  title: string;
  detail: string;
  links: { label: string; target: GuideTarget }[];
}
const mos = (area: string): GuideTarget => ({ route: 'management', area });
export const crmWeek = [
  {
    day: 'Понедельник',
    title: 'Delivery',
    detail:
      'Проверить загрузку и отсутствия в командах, посмотреть Пульс и задачи сотрудников. Использовать факты при обновлении Scorecard.',
    links: [
      { label: 'Команды и загрузка', target: { route: 'teams' } },
      { label: 'Пульс', target: { route: 'pulse' } },
      { label: 'Scorecard', target: mos('signals') },
    ],
  },
  {
    day: 'Вторник',
    title: 'Planning & Backlog',
    detail:
      'Сверить проекты, задачи и доступность людей. Planning Loop открывать при подготовке квартального плана.',
    links: [
      { label: 'Проекты', target: { route: 'projects' } },
      { label: 'Задачи CRM', target: { route: 'tasks' } },
      { label: 'Management Backlog', target: mos('problems') },
    ],
  },
  {
    day: 'Среда',
    title: 'People & Leadership',
    detail:
      'Подготовить 1-on-1, проверить ИПР, цели и кадровые сигналы в карточках сотрудников. People Loop — для исключений, требующих решения.',
    links: [
      { label: 'Сотрудники и 1-on-1', target: { route: 'crm' } },
      { label: 'Развитие и ИПР', target: { route: 'development' } },
    ],
  },
  {
    day: 'Четверг',
    title: 'Decisions & Alignment',
    detail:
      'Подготовить решения по обязательствам и зависимостям проектов. Договорённости фиксировать в исходной задаче; отдельное управленческое действие — только при необходимости личного контроля.',
    links: [
      { label: 'Реестр', target: mos('actions') },
      { label: 'Проекты', target: { route: 'projects' } },
      { label: 'Личные заметки', target: { route: 'personal' } },
    ],
  },
  {
    day: 'Пятница',
    title: 'Improvement & Closure',
    detail:
      'Разобрать системные исключения и закрыть неделю. Проверить сроки задач CRM и личных задач; статусы менять в их источниках.',
    links: [
      { label: 'Weekly Review', target: mos('review') },
      { label: 'Задачи CRM', target: { route: 'tasks' } },
      { label: 'Личные задачи', target: { route: 'personal' } },
    ],
  },
] satisfies {
  day: string;
  title: string;
  detail: string;
  links: { label: string; target: GuideTarget }[];
}[];

export function workDay(s: ManagementState, now: Date): WorkSlot[] {
  const day = now.getDay();
  if (day === 0 || day === 6) return [];
  const theme = crmWeek[day - 1]!;
  const quarter = s.quarters
    .flatMap((q) => [
      { date: q.planningDate, area: 'planning', title: 'Planning Review' },
      { date: q.peopleDate, area: 'people', title: 'People Review' },
      { date: q.improvementDate, area: 'improvements', title: 'Improvement Review' },
    ])
    .filter((q) => q.date === iso(now));
  const system: WorkSlot[] = quarter.length
    ? [
        {
          start: 565,
          end: 660,
          time: '09:25–11:00',
          title: quarter.map((q) => q.title).join(' · '),
          detail:
            quarter.length > 1
              ? 'Несколько квартальных разборов назначены на один блок. Разведите даты в Rhythm.'
              : 'Квартальный разбор занимает существующий утренний блок. Используйте факты CRM; решения и исключения — в соответствующем контуре.',
          links: quarter.map((q) => ({ label: q.title, target: mos(q.area) })),
        },
      ]
    : day === 5
      ? [
          {
            start: 565,
            end: 615,
            time: '09:25–10:15',
            title: 'Backlog по исключениям',
            detail: 'Проверить системные проблемы и эффект изменений.',
            links: [{ label: 'Management Backlog', target: mos('problems') }],
          },
          {
            start: 615,
            end: 660,
            time: '10:15–11:00',
            title: 'Закрытие недели',
            detail: theme.detail,
            links: theme.links,
          },
        ]
      : [
          {
            start: 565,
            end: 660,
            time: '09:25–11:00',
            title: theme.title,
            detail: theme.detail,
            links: theme.links,
          },
        ];
  return [
    {
      start: 540,
      end: 555,
      time: '09:00–09:15',
      title: 'Разобрать входящие',
      detail: 'Почтовый triage. Зафиксировать только договорённости, требующие личного контроля.',
      links: [{ label: 'Реестр', target: mos('actions') }],
    },
    {
      start: 555,
      end: 565,
      time: '09:15–09:25',
      title: 'Выбрать фокус дня',
      detail: 'Посмотреть сроки Management OS и CRM, выбрать до трёх действий.',
      links: [{ label: 'Cockpit', target: mos('cockpit') }],
    },
    ...system,
    {
      start: 990,
      end: 1020,
      time: '16:30–17:00',
      title: 'Эскалации и согласования',
      detail: 'Разобрать поступившие исключения. Если их нет, окно не нужно заполнять.',
      links: [{ label: 'Реестр', target: mos('actions') }],
    },
  ];
}
export function guideNow(s: ManagementState, now: Date) {
  const slots = workDay(s, now),
    minute = now.getHours() * 60 + now.getMinutes();
  const current = slots.find((x) => x.start <= minute && minute < x.end);
  const next = slots.find((x) => x.start > minute);
  const nextDate = new Date(now);
  nextDate.setHours(9, 0, 0, 0);
  do {
    nextDate.setDate(nextDate.getDate() + 1);
  } while ([0, 6].includes(nextDate.getDay()));
  return {
    slots,
    current,
    next: next ?? workDay(s, nextDate)[0]!,
    nextDate: next ? iso(now) : iso(nextDate),
    label:
      current?.title ??
      (slots.length
        ? minute < 540
          ? 'До начала рабочего ритма'
          : minute >= 1020
            ? 'Рабочий ритм завершён'
            : 'Встречи и работа по календарю'
        : 'Выходной · обязательных блоков нет'),
  };
}

/** Read-only projection: records remain in their original repositories. */
export function dueGuide(
  s: ManagementState,
  employees: Employee[],
  personal: unknown,
  now: Date,
): GuideItem[] {
  const today = iso(now),
    tomorrow = shift(today, 1),
    items: GuideItem[] = [];
  const add = (
    id: string,
    date: string | undefined,
    title: string,
    source: string,
    target: GuideTarget,
  ) => {
    if (date && date <= tomorrow)
      items.push({
        id,
        date,
        title,
        reason: `${source} · ${date < today ? 'срок прошёл' : date === today ? 'сегодня' : 'завтра'} · ${date}`,
        target,
      });
  };
  for (const a of s.actions.filter(
    (a) => a.status !== 'DONE' && (a.status !== 'WAITING' || a.due! <= today),
  ))
    add(`mos:${a.id}`, a.due, a.title!, 'Реестр', mos('actions'));
  for (const p of s.problems.filter((p) => p.status === 'MONITORING'))
    add(`problem:${p.id}`, p.due, p.title!, 'Проверка эффекта', mos('problems'));
  for (const e of employees) {
    const target = (tab: string): GuideTarget => ({ route: 'crm', employeeId: e.id, tab });
    add(
      `meeting:${e.id}`,
      e.oneOnOne.nextDate,
      `1-on-1 · ${e.fullName}`,
      'Проверить встречу в карточке; время не задано',
      target('oneonone'),
    );
    e.tasks.forEach((t, i) => {
      if (t.status !== 'выполнена')
        add(`task:${e.id}:${i}`, t.due, `${e.fullName} · ${t.text}`, 'Задача CRM', target('tasks'));
    });
    e.development.forEach((d, i) => {
      if (d.status !== 'выполнено')
        add(`ipr:${e.id}:${i}`, d.deadline, `${e.fullName} · ${d.zone}`, 'ИПР', target('extra'));
    });
  }
  if (
    personal &&
    typeof personal === 'object' &&
    'todos' in personal &&
    Array.isArray(personal.todos)
  )
    for (const [i, t] of (personal.todos as unknown[]).entries()) {
      if (
        t &&
        typeof t === 'object' &&
        'done' in t &&
        'text' in t &&
        'due' in t &&
        t.done !== true &&
        typeof t.text === 'string' &&
        typeof t.due === 'string'
      )
        add(`personal:${i}`, t.due, t.text, 'Личная задача CRM', { route: 'personal' });
    }
  for (const q of s.quarters)
    for (const [key, area, title] of [
      ['planningDate', 'planning', 'Planning Review'],
      ['peopleDate', 'people', 'People Review'],
      ['improvementDate', 'improvements', 'Improvement Review'],
      ['approvalDate', 'planning', 'Внешнее утверждение плана'],
    ] as const) {
      // Past reviews have no completion status: do not invent overdue work.
      if (q[key] && q[key] >= today)
        add(
          `quarter:${q.id}:${key}`,
          q[key],
          `${title} · ${q.quarter}`,
          'Квартальная дата',
          mos(area),
        );
    }
  return items.sort((a, b) => a.date!.localeCompare(b.date!) || a.id.localeCompare(b.id));
}
