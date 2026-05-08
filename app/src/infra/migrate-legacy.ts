/**
 * Миграция данных из legacy localStorage (`backlog_tracker_v2` / `_v1`)
 * в Supabase под текущего залогиненного пользователя.
 *
 * Использование:
 *   import { migrateLegacyToSupabase } from '@/infra/migrate-legacy';
 *   await migrateLegacyToSupabase({ dryRun: false });
 *
 * Защиты:
 *  - dryRun по умолчанию — не пишет в БД, возвращает план;
 *  - идемпотентность — проверяет наличие legacy_id у пользователя;
 *  - резервная копия legacy записывается в localStorage `legacy_backup_<ts>`.
 */
import { supabase } from './supabase';
import { TaskSchema, TeamSchema } from '@/data/schema';

const LEGACY_KEYS = ['backlog_tracker_v2', 'backlog_tracker_v1'] as const;

interface LegacyTeam {
  id: number;
  name: string;
  color: string;
  ana: number;
  dev: number;
  tst: number;
}
interface LegacyTask {
  id: number;
  name: string;
  shortDescription?: string;
  teamId: number | null;
  ana: number;
  dev: number;
  tst: number;
  status: 'pending' | 'approved' | 'rejected';
  priority: 'high' | 'medium' | 'low' | '';
  rank: number;
  value?: string;
  effect?: string;
  systems?: string;
  stakeholder?: string;
  quarter?: string;
  comment?: string;
  jira?: string;
  sd?: string;
}
interface LegacyState {
  tasks?: LegacyTask[];
  teams?: LegacyTeam[];
  nextId?: number;
  nextTeamId?: number;
}

export interface MigrationReport {
  dryRun: boolean;
  source: string | null;
  teamsToInsert: number;
  tasksToInsert: number;
  skippedTeams: number;
  skippedTasks: number;
  errors: string[];
}

function loadLegacy(): { raw: string; key: string } | null {
  for (const key of LEGACY_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw) return { raw, key };
  }
  return null;
}

export async function migrateLegacyToSupabase(
  opts: { dryRun?: boolean } = {},
): Promise<MigrationReport> {
  const dryRun = opts.dryRun ?? true;
  const report: MigrationReport = {
    dryRun,
    source: null,
    teamsToInsert: 0,
    tasksToInsert: 0,
    skippedTeams: 0,
    skippedTasks: 0,
    errors: [],
  };

  const legacy = loadLegacy();
  if (!legacy) return report;
  report.source = legacy.key;

  let parsed: LegacyState;
  try {
    parsed = JSON.parse(legacy.raw) as LegacyState;
  } catch (e) {
    report.errors.push(`Не удалось распарсить ${legacy.key}: ${(e as Error).message}`);
    return report;
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    report.errors.push('Не залогинен');
    return report;
  }
  const ownerId = userData.user.id;

  // Уже импортированные ранее legacy_id — пропускаем
  const { data: existingTeams } = await supabase
    .from('teams')
    .select('id, legacy_id')
    .eq('owner_id', ownerId)
    .not('legacy_id', 'is', null);

  const teamLegacyToUuid = new Map<number, string>(
    (existingTeams ?? []).map((t) => [t.legacy_id as number, t.id as string]),
  );

  // Бэкап перед записью
  if (!dryRun) {
    localStorage.setItem(`legacy_backup_${Date.now()}`, legacy.raw);
  }

  // Команды
  const teamsToInsert = (parsed.teams ?? []).filter((t) => !teamLegacyToUuid.has(t.id));
  report.skippedTeams = (parsed.teams?.length ?? 0) - teamsToInsert.length;

  if (!dryRun && teamsToInsert.length > 0) {
    const rows = teamsToInsert.map((t) => ({
      owner_id: ownerId,
      legacy_id: t.id,
      name: t.name,
      color: t.color,
      ana: t.ana,
      dev: t.dev,
      tst: t.tst,
    }));
    const { data, error } = await supabase.from('teams').insert(rows).select('id, legacy_id');
    if (error) {
      report.errors.push(`teams insert: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        teamLegacyToUuid.set(r.legacy_id as number, r.id as string);
      }
    }
  }
  report.teamsToInsert = teamsToInsert.length;

  // Существующие задачи по legacy_id
  const { data: existingTasks } = await supabase
    .from('tasks')
    .select('legacy_id')
    .eq('owner_id', ownerId)
    .not('legacy_id', 'is', null);
  const taskLegacy = new Set<number>((existingTasks ?? []).map((t) => t.legacy_id as number));

  const tasksToInsert = (parsed.tasks ?? []).filter((t) => !taskLegacy.has(t.id));
  report.skippedTasks = (parsed.tasks?.length ?? 0) - tasksToInsert.length;

  if (!dryRun && tasksToInsert.length > 0) {
    const rows = tasksToInsert.map((t) => ({
      owner_id: ownerId,
      legacy_id: t.id,
      name: t.name,
      short_description: t.shortDescription ?? '',
      team_id: t.teamId != null ? (teamLegacyToUuid.get(t.teamId) ?? null) : null,
      ana: t.ana,
      dev: t.dev,
      tst: t.tst,
      status: t.status,
      priority: t.priority,
      rank: t.rank,
      value: t.value ?? '',
      effect: t.effect ?? '',
      systems: t.systems ?? '',
      stakeholder: t.stakeholder ?? '',
      quarter: t.quarter ?? '',
      comment: t.comment ?? '',
      jira: t.jira ?? '',
      sd: t.sd ?? '',
    }));
    const { error } = await supabase.from('tasks').insert(rows);
    if (error) report.errors.push(`tasks insert: ${error.message}`);
  }
  report.tasksToInsert = tasksToInsert.length;

  return report;
}

// Ссылки используются только для типизации и валидации входных данных
// (схемы пригодятся при добавлении строгой проверки legacy-формата)
void TaskSchema;
void TeamSchema;
