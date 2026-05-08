import { z } from 'zod';

// Соответствует legacy backlog_tracker_v2 (см. legacy index.html):
// tasks/teams + nextId/nextTeamId.

export const TeamSchema = z.object({
  id: z.string().uuid(),
  legacyId: z.number().int().optional(), // числовой id из legacy
  name: z.string().min(1),
  color: z.string().default('#534AB7'),
  ana: z.number().min(0).max(100).default(100),
  dev: z.number().min(0).max(100).default(100),
  tst: z.number().min(0).max(100).default(100),
});
export type Team = z.infer<typeof TeamSchema>;

export const TaskStatus = z.enum(['pending', 'approved', 'rejected']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TaskPriority = z.enum(['high', 'medium', 'low', '']);
export type TaskPriority = z.infer<typeof TaskPriority>;

export const TaskSchema = z.object({
  id: z.string().uuid(),
  legacyId: z.number().int().optional(),
  name: z.string().min(1),
  shortDescription: z.string().default(''),
  teamId: z.string().uuid().nullable().default(null),
  ana: z.number().min(0).default(0), // дни
  dev: z.number().min(0).default(0),
  tst: z.number().min(0).default(0),
  status: TaskStatus.default('pending'),
  priority: TaskPriority.default(''),
  rank: z.number().int().default(0),
  value: z.string().default(''),
  effect: z.string().default(''),
  systems: z.string().default(''),
  stakeholder: z.string().default(''),
  quarter: z.string().default(''),
  comment: z.string().default(''),
  jira: z.string().default(''),
  sd: z.string().default(''),
});
export type Task = z.infer<typeof TaskSchema>;

export const SCHEMA_VERSION = 1 as const;
