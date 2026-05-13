/**
 * Staff CRM — доменные типы и Zod-схемы.
 *
 * Источник истины: legacy `staff-crm/index.html` (localStorage `staff_crm_v1`).
 * Для новых полей и редко используемых вложенных структур применяется
 * `.passthrough()` — это позволяет принимать legacy-данные без потерь
 * и не требует править схему при каждом мелком изменении формы.
 *
 * Типы, на которых стоит «строгий» Zod, — это те, что напрямую читают
 * доменные функции (risk, capacity, agenda, notifications, metrics).
 */
import { z } from 'zod';

// ---------------------------------------------------------------
// Базовые блоки
// ---------------------------------------------------------------

/** ISO-дата `YYYY-MM-DD` или пустая строка. */
export const IsoDate = z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), {
  message: 'expected YYYY-MM-DD or empty string',
});
export type IsoDate = z.infer<typeof IsoDate>;

/** Период `[from..to]`, обе границы — ISO-даты. */
export const PeriodSchema = z.object({
  from: IsoDate.default(''),
  to: IsoDate.default(''),
});
export type Period = z.infer<typeof PeriodSchema>;

// ---------------------------------------------------------------
// Нагрузка
// ---------------------------------------------------------------

export const LoadSchema = z
  .object({
    currentDays: z.number().default(0),
    currentPercent: z.number().default(0),
    capacityQuarter: z.number().default(0),
    /** Метка квартала, например `Q1 2026`. */
    capacityQtr: z.string().default(''),
    status: z.string().default('доступен'),
    nextMonthPlan: z.number().default(0),
    vacations: z.array(PeriodSchema).default([]),
    sickLeaves: z.array(PeriodSchema).default([]),
    projects: z.array(z.string()).default([]),
  })
  .passthrough();
export type Load = z.infer<typeof LoadSchema>;

// ---------------------------------------------------------------
// Задачи / ИПР / навыки / цели
// ---------------------------------------------------------------

export const TaskItemSchema = z
  .object({
    text: z.string().default(''),
    /** `'выполнена' | 'в работе' | 'не начата'`. */
    status: z.string().default(''),
    /** ISO-дата дедлайна. */
    due: z.string().default(''),
  })
  .passthrough();
export type TaskItem = z.infer<typeof TaskItemSchema>;

export const DevelopmentItemSchema = z
  .object({
    zone: z.string().default(''),
    /** `'выполнено' | 'в работе' | 'не начато'`. */
    status: z.string().default(''),
    deadline: z.string().default(''),
  })
  .passthrough();
export type DevelopmentItem = z.infer<typeof DevelopmentItemSchema>;

// ---------------------------------------------------------------
// История проектов и команд
// ---------------------------------------------------------------

export const ProjectHistoryItemSchema = z
  .object({
    /** Название проекта. */
    name: z.string().default(''),
    /** Роль на проекте. */
    role: z.string().default(''),
    /** ISO-дата начала. */
    from: z.string().default(''),
    /** ISO-дата окончания (пусто — текущий). */
    to: z.string().default(''),
    /** Достижения / ключевой результат. */
    achievements: z.string().default(''),
  })
  .passthrough();
export type ProjectHistoryItem = z.infer<typeof ProjectHistoryItemSchema>;

export const TeamHistoryItemSchema = z
  .object({
    /** ISO-дата смены команды. */
    date: z.string().default(''),
    /** Из какой команды. */
    from: z.string().default(''),
    /** В какую команду. */
    to: z.string().default(''),
    /** Комментарий / причина перехода. */
    comment: z.string().default(''),
  })
  .passthrough();
export type TeamHistoryItem = z.infer<typeof TeamHistoryItemSchema>;

export const SkillSchema = z
  .object({
    name: z.string().default(''),
    /** Уровень навыка `0..5`. */
    level: z.number().min(0).max(5).default(0),
  })
  .passthrough();
export type Skill = z.infer<typeof SkillSchema>;

export const GoalSchema = z
  .object({
    text: z.string().default(''),
    /** `'в работе' | 'выполнена' | ...`. */
    status: z.string().default(''),
    /** Прогресс `0..100`. */
    progress: z.number().min(0).max(100).default(0),
  })
  .passthrough();
export type Goal = z.infer<typeof GoalSchema>;

// ---------------------------------------------------------------
// Риск / оценка руководителя / 1-on-1
// ---------------------------------------------------------------

export const RiskLevel = z.enum(['низкий', 'средний', 'высокий']);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const RiskSchema = z.object({
  level: RiskLevel.default('низкий'),
  comment: z.string().default(''),
});
export type Risk = z.infer<typeof RiskSchema>;

export const ManagerRatingSchema = z.object({
  score: z.number().min(1).max(5).default(3),
  comment: z.string().default(''),
});
export type ManagerRating = z.infer<typeof ManagerRatingSchema>;

export const OneOnOneHistoryItemSchema = z
  .object({
    date: z.string().default(''),
  })
  .passthrough();
export type OneOnOneHistoryItem = z.infer<typeof OneOnOneHistoryItemSchema>;

export const AgendaChecklistSchema = z.object({
  feedback: z.boolean().default(false),
  goals: z.boolean().default(false),
  load: z.boolean().default(false),
  growth: z.boolean().default(false),
  wellbeing: z.boolean().default(false),
});
export type AgendaChecklist = z.infer<typeof AgendaChecklistSchema>;

export const OneOnOneSchema = z
  .object({
    nextDate: z.string().default(''),
    prepNotes: z.string().default(''),
    /** История встреч, новейшая — первой. */
    history: z.array(OneOnOneHistoryItemSchema).default([]),
    agendaChecklist: AgendaChecklistSchema.default({
      feedback: false,
      goals: false,
      load: false,
      growth: false,
      wellbeing: false,
    }),
    agendaExtra: z.string().default(''),
  })
  .passthrough();
export type OneOnOne = z.infer<typeof OneOnOneSchema>;

// ---------------------------------------------------------------
// Сотрудник
// ---------------------------------------------------------------

export const PromotionReadiness = z.enum([
  'не готов',
  'готов через 6 мес',
  'готов через год',
  'готов сейчас',
]);
export type PromotionReadiness = z.infer<typeof PromotionReadiness>;

export const EmployeeSchema = z
  .object({
    id: z.string(),
    fullName: z.string().default(''),
    role: z.string().default(''),
    /** Имя команды (legacy-формат, до перехода на team_id uuid). */
    team: z.string().default(''),
    hireDate: z.string().default(''),
    salaryReviewDate: z.string().default(''),
    salary: z.number().default(0),
    employeeNumber: z.string().default(''),
    positionId: z.string().default(''),
    location: z.string().default(''),
    email: z.string().default(''),
    teams: z.string().default(''),
    telegram: z.string().default(''),
    grade: z.string().default('Junior'),
    birthday: z.string().default(''),
    load: LoadSchema,
    skills: z.array(SkillSchema).default([]),
    development: z.array(DevelopmentItemSchema).default([]),
    managerRating: ManagerRatingSchema.default({ score: 3, comment: '' }),
    projectHistory: z.array(ProjectHistoryItemSchema).default([]),
    salaryHistory: z.array(z.unknown()).default([]),
    hobbies: z.string().default(''),
    managerComments: z.array(z.unknown()).default([]),
    documents: z.array(z.unknown()).default([]),
    risk: RiskSchema.default({ level: 'низкий', comment: '' }),
    promotionReadiness: PromotionReadiness.default('не готов'),
    workPreference: z.string().default('гибрид'),
    tasks: z.array(TaskItemSchema).default([]),
    oneOnOne: OneOnOneSchema.default({
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
    }),
    goalsCurrentPeriod: z.string().default(''),
    goals: z.array(GoalSchema).default([]),
    goalsSummary: z
      .object({
        score: z.number().default(3),
        comment: z.string().default(''),
        date: z.string().default(''),
      })
      .default({ score: 3, comment: '', date: '' }),
    teamHistory: z.array(TeamHistoryItemSchema).default([]),
  })
  .passthrough();
export type Employee = z.infer<typeof EmployeeSchema>;

// ---------------------------------------------------------------
// Команда / проект / личное
// ---------------------------------------------------------------

export const TeamSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1),
    color: z.string().default('#534AB7'),
  })
  .passthrough();
export type Team = z.infer<typeof TeamSchema>;

export const ProjectSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1),
    status: z.string().default(''),
  })
  .passthrough();
export type Project = z.infer<typeof ProjectSchema>;

/**
 * Personal — произвольный JSON, по одному документу на пользователя.
 * Содержимое определяется UI и эволюционирует независимо от схемы БД.
 */
export const PersonalSchema = z.object({}).passthrough();
export type Personal = z.infer<typeof PersonalSchema>;

// ---------------------------------------------------------------
// Пульс команд — еженедельный снэпшот
// ---------------------------------------------------------------

export const PulseStatus = z.enum(['green', 'yellow', 'red']);
export type PulseStatus = z.infer<typeof PulseStatus>;

export const PulseEscalationKind = z.enum(['decision', 'resource', 'communication']);
export type PulseEscalationKind = z.infer<typeof PulseEscalationKind>;

export const TeamPulseSnapshotSchema = z
  .object({
    id: z.string(),
    /** `Team.id` соответствующей команды. */
    teamId: z.string(),
    /** ISO-дата понедельника недели, например `2026-05-11`. */
    weekStart: z.string(),
    status: PulseStatus.default('green'),
    /** 0..10 — субъективная плотность хвостов. */
    tailIndex: z.number().min(0).max(10).default(0),
    /** Сколько эскалаций было за неделю (счётчик). */
    escalations: z.number().min(0).default(0),
    /** Тип «главной» эскалации, опционально. */
    escalationKind: PulseEscalationKind.nullable().default(null),
    /** Одна строка свободного текста — что важного на этой неделе. */
    note: z.string().default(''),
  })
  .passthrough();
export type TeamPulseSnapshot = z.infer<typeof TeamPulseSnapshotSchema>;

// ---------------------------------------------------------------
// Версия схемы (для миграций localStorage / JSON-бэкапов)
// ---------------------------------------------------------------

export const SCHEMA_VERSION = 2 as const;
