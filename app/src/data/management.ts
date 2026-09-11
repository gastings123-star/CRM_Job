import { z } from 'zod';

export const managementAreas = [
  'actions',
  'problems',
  'signals',
  'observations',
  'planning',
  'people',
  'improvements',
  'quarters',
  'daily',
  'scopes',
] as const;
export type ManagementArea = (typeof managementAreas)[number];
export interface ManagementRow {
  id: string;
  [key: string]: string;
}
const required = z.string().trim().min(1, 'Обязательное поле').max(10000);
export const managementDate = z
  .string()
  .refine(
    (v) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      !Number.isNaN(Date.parse(v)) &&
      new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v,
    'Укажите корректную дату',
  );
const optionalDate = z.union([z.literal(''), managementDate]);
const q = z.string().regex(/^\d{4}-Q[1-4]$/, 'Формат: 2026-Q3');
const base = { id: required };
const team = { teamId: required };
const person = { employeeId: z.string().default(''), person: z.string().default('') };
const source = { source: z.string().default('') };
const quarter = { quarter: q, ...team };
export const categories = [
  'Delivery',
  'Planning',
  'People',
  'Process',
  'Leadership',
  'Quality',
] as const;
export const peopleCategories = [
  'Performance-проблема',
  'Критичная компетенция на одном человеке',
  'Bus factor',
  'Риск ухода',
  'Готовность к следующей роли',
  'Нужен план развития, но его нет',
] as const;
export const improvementExceptions = [
  'Нет исключения',
  'Нет движения целый квартал',
  'Повтор 2+ квартала подряд',
  'Нужно решение / ресурс вне команды',
] as const;
export const signalDefinitions = [
  {
    key: 'lead',
    label: 'Lead Time',
    type: 'Fact',
    rule: 'В пределах исторического baseline → Green; заметно хуже → Attention; устойчивое ухудшение / сильная аномалия → Critical.',
  },
  {
    key: 'carry',
    label: 'Переносы',
    type: 'Fact',
    rule: '≤30% → Green; >30% один спринт → Attention; >30% два спринта подряд → Critical.',
  },
  {
    key: 'readiness',
    label: 'Readiness спринта',
    type: 'Management signal',
    rule: 'Ready → Green; Risk → Attention; Not ready → Critical. DPO подтверждает требования, оценку, зависимости, реализуемость.',
  },
  {
    key: 'capacity',
    label: 'Capacity квартала',
    type: 'Management signal',
    rule: 'Обязательства покрыты → Green; предпосылки ухудшились, управляемо → Attention; обязательства не покрываются → Critical.',
  },
  {
    key: 'people',
    label: 'People risks',
    type: 'Management signal',
    rule: 'Нет значимых рисков → Green; DPO управляет риском → Attention; нужно вмешательство Дмитрия → Critical. Не по количеству.',
  },
] as const;
export const managementSchemas = {
  actions: z
    .object({
      ...base,
      title: required,
      type: z.enum(['СВОЯ', 'ПОРУЧЕНИЕ', 'BOSS', 'CONTROL']),
      due: managementDate,
      status: z.enum(['OPEN', 'WAITING', 'CONTROL', 'DONE']),
      assignee: z.string().default(''),
      employeeId: z.string().default(''),
      teamId: z.string().default(''),
      ...source,
    })
    .passthrough()
    .refine(
      (x) => x.type !== 'ПОРУЧЕНИЕ' || !!(x.assignee.trim() || x.employeeId),
      'Для поручения укажите исполнителя',
    ),
  problems: z
    .object({
      ...base,
      title: required,
      contour: required,
      teamId: z.string().default(''),
      category: z.enum(categories),
      owner: required,
      due: managementDate,
      criterion: required,
      status: z.enum(['NEW', 'IN WORK', 'MONITORING', 'CLOSED']),
    })
    .passthrough(),
  signals: z
    .object({
      ...base,
      ...team,
      signal: z.enum(['lead', 'carry', 'readiness', 'capacity', 'people']),
      level: z.enum(['Green', 'Attention', 'Critical']),
      basis: required,
    })
    .passthrough(),
  observations: z
    .object({
      ...base,
      ...team,
      ...person,
      date: managementDate,
      profile: z.enum(['DPO', 'Лид']),
      signal: z.enum([
        'Без решения',
        'Расхождение с фактом',
        'Поздняя эскалация',
        'Риск выявлен извне',
      ]),
      note: required,
    })
    .passthrough()
    .refine((x) => !!(x.employeeId || x.person.trim()), 'Укажите человека')
    .refine(
      (x) =>
        x.profile === 'DPO'
          ? x.signal !== 'Риск выявлен извне'
          : x.signal !== 'Расхождение с фактом',
      'Сигнал не соответствует профилю',
    ),
  planning: z
    .object({
      ...base,
      ...quarter,
      requirements: required,
      estimate: required,
      dependencies: required,
      feasibility: required,
      capacity: required,
      readiness: z.enum(['Ready', 'Risk', 'Not ready']),
      risk: z.string().default(''),
    })
    .passthrough()
    .refine((x) => x.readiness === 'Ready' || !!x.risk.trim(), 'Укажите основание риска'),
  people: z
    .object({ ...base, ...quarter, ...person, category: z.enum(peopleCategories), note: required })
    .passthrough()
    .refine((x) => !!(x.employeeId || x.person.trim()), 'Укажите человека'),
  improvements: z
    .object({
      ...base,
      ...quarter,
      title: required,
      owner: required,
      approval: z.enum(['На рассмотрении', 'Утверждено', 'Вернуть на доработку']),
      exception: z.enum(improvementExceptions),
      outcome: z.string().default(''),
    })
    .passthrough()
    .refine((x) => x.exception === 'Нет исключения' || !!x.outcome.trim(), 'Опишите исключение'),
  quarters: z
    .object({
      ...base,
      quarter: q,
      approvalDate: optionalDate,
      planningDate: optionalDate,
      peopleDate: optionalDate,
      improvementDate: optionalDate,
    })
    .passthrough(),
  daily: z
    .object({
      ...base,
      title: required,
      date: managementDate,
      status: z.enum(['OPEN', 'DONE', 'DISCARDED', 'CONVERTED']),
      actionId: z.string().default(''),
    })
    .passthrough(),
  scopes: z
    .object({ ...base, ...team, scope: z.enum(['full', 'delivery', 'people']) })
    .passthrough(),
};
export const FocusRefSchema = z.union([
  z.object({ area: z.enum(['actions', 'daily']), id: required }),
  z.object({
    area: z.literal('crm'),
    id: required,
    employeeId: required,
    kind: z.enum(['task', 'meeting', 'development']),
  }),
  z.object({ area: z.literal('personal'), id: required }),
]);
export type FocusRef = z.infer<typeof FocusRefSchema>;
export const MeetingNoteSchema = z
  .object({
    id: required,
    date: managementDate,
    title: required,
    decision: required,
    participants: z.string().default(''),
    sourceActionId: z.string().default(''),
    actionIds: z.array(required).default([]),
  })
  .passthrough();
export type MeetingNote = z.infer<typeof MeetingNoteSchema>;
export const ManagementSchema = z
  .object({
    meetingNotes: z.array(MeetingNoteSchema).default([]),
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    actions: z.array(managementSchemas.actions),
    problems: z.array(managementSchemas.problems),
    signals: z.array(managementSchemas.signals),
    observations: z.array(managementSchemas.observations),
    planning: z.array(managementSchemas.planning),
    people: z.array(managementSchemas.people),
    improvements: z.array(managementSchemas.improvements),
    quarters: z.array(managementSchemas.quarters),
    daily: z.array(managementSchemas.daily),
    scopes: z.array(managementSchemas.scopes),
    sprintStart: optionalDate,
    focus: z.object({
      date: optionalDate,
      refs: z.array(FocusRefSchema).max(3),
    }),
  })
  .passthrough();
export type ManagementState = {
  meetingNotes?: MeetingNote[];
  version: 1;
  revision: number;
  sprintStart: string;
  focus: { date: string; refs: FocusRef[] };
} & Record<ManagementArea, ManagementRow[]>;
export function emptyManagement(): ManagementState {
  return {
    meetingNotes: [],
    version: 1,
    revision: 0,
    sprintStart: '',
    focus: { date: '', refs: [] },
    actions: [],
    problems: [],
    signals: [],
    observations: [],
    planning: [],
    people: [],
    improvements: [],
    quarters: [],
    daily: [],
    scopes: [],
  };
}
