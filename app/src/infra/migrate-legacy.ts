/**
 * Миграция Staff CRM из legacy localStorage / JSON-бэкапа в Supabase.
 *
 * Источник:
 *   - localStorage `staff_crm_v1`        — `{ employees: [...], selectedId }`
 *   - localStorage `staff_crm_teams_v1`  — `Team[]`
 *
 * Цель:
 *   - public.teams      — owner_id, legacy_id, name, color
 *   - public.employees  — owner_id, legacy_id, full_name, role, team_id, payload (jsonb)
 *
 * Защиты:
 *   - dryRun по умолчанию — ничего не пишет, возвращает план;
 *   - идемпотентность через unique(owner_id, legacy_id);
 *   - бэкап legacy-стейта в localStorage `legacy_backup_<ts>` перед записью.
 */
import { supabase } from './supabase';
import { EmployeeSchema, TeamSchema, type Employee, type Team } from '@/data/schema';

const EMPLOYEES_KEY = 'staff_crm_v1';
const TEAMS_KEY = 'staff_crm_teams_v1';

export interface MigrationReport {
  dryRun: boolean;
  source: { employees: string | null; teams: string | null };
  teamsToInsert: number;
  employeesToInsert: number;
  skippedTeams: number;
  skippedEmployees: number;
  errors: string[];
}

interface LegacyEmployeesBlob {
  employees?: unknown[];
  selectedId?: string | null;
}

function readLegacy(): {
  employees: Employee[];
  teams: Team[];
  rawEmployees: string | null;
  rawTeams: string | null;
  errors: string[];
} {
  const errors: string[] = [];
  const rawEmployees = localStorage.getItem(EMPLOYEES_KEY);
  const rawTeams = localStorage.getItem(TEAMS_KEY);

  const employees: Employee[] = [];
  const teams: Team[] = [];

  if (rawEmployees) {
    try {
      const blob = JSON.parse(rawEmployees) as LegacyEmployeesBlob;
      const list = Array.isArray(blob.employees) ? blob.employees : [];
      for (const item of list) {
        const parsed = EmployeeSchema.safeParse(item);
        if (parsed.success) {
          employees.push(parsed.data);
        } else {
          errors.push(`employee parse: ${parsed.error.message}`);
        }
      }
    } catch (e) {
      errors.push(`Не удалось распарсить ${EMPLOYEES_KEY}: ${(e as Error).message}`);
    }
  }

  if (rawTeams) {
    try {
      const list = JSON.parse(rawTeams) as unknown[];
      if (Array.isArray(list)) {
        for (const item of list) {
          const parsed = TeamSchema.safeParse(item);
          if (parsed.success) {
            teams.push(parsed.data);
          } else {
            errors.push(`team parse: ${parsed.error.message}`);
          }
        }
      }
    } catch (e) {
      errors.push(`Не удалось распарсить ${TEAMS_KEY}: ${(e as Error).message}`);
    }
  }

  return { employees, teams, rawEmployees, rawTeams, errors };
}

export async function migrateLegacyToSupabase(
  opts: { dryRun?: boolean } = {},
): Promise<MigrationReport> {
  const dryRun = opts.dryRun ?? true;
  const report: MigrationReport = {
    dryRun,
    source: { employees: null, teams: null },
    teamsToInsert: 0,
    employeesToInsert: 0,
    skippedTeams: 0,
    skippedEmployees: 0,
    errors: [],
  };

  const legacy = readLegacy();
  report.errors.push(...legacy.errors);
  report.source.employees = legacy.rawEmployees ? EMPLOYEES_KEY : null;
  report.source.teams = legacy.rawTeams ? TEAMS_KEY : null;

  if (legacy.employees.length === 0 && legacy.teams.length === 0) {
    return report;
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    report.errors.push('Не залогинен');
    return report;
  }
  const ownerId = userData.user.id;

  // Бэкап legacy перед записью
  if (!dryRun) {
    const ts = Date.now();
    if (legacy.rawEmployees) {
      localStorage.setItem(`legacy_backup_${EMPLOYEES_KEY}_${ts}`, legacy.rawEmployees);
    }
    if (legacy.rawTeams) {
      localStorage.setItem(`legacy_backup_${TEAMS_KEY}_${ts}`, legacy.rawTeams);
    }
  }

  // ---------- Команды ----------
  const { data: existingTeams } = await supabase
    .from('teams')
    .select('id, legacy_id, name')
    .eq('owner_id', ownerId);

  /** legacy_id (id из localStorage) -> uuid из БД */
  const teamLegacyToUuid = new Map<string, string>();
  /** name -> uuid (для случая, когда у legacy-записи нет id, но команда создана раньше) */
  const teamNameToUuid = new Map<string, string>();

  for (const t of existingTeams ?? []) {
    if (t.legacy_id) teamLegacyToUuid.set(String(t.legacy_id), t.id as string);
    if (t.name) teamNameToUuid.set(t.name as string, t.id as string);
  }

  const teamsToInsert = legacy.teams.filter((t) => !teamLegacyToUuid.has(String(t.id)));
  report.skippedTeams = legacy.teams.length - teamsToInsert.length;
  report.teamsToInsert = teamsToInsert.length;

  if (!dryRun && teamsToInsert.length > 0) {
    const rows = teamsToInsert.map((t) => ({
      owner_id: ownerId,
      legacy_id: String(t.id),
      name: t.name,
      color: t.color ?? '#534AB7',
    }));
    const { data, error } = await supabase.from('teams').insert(rows).select('id, legacy_id, name');
    if (error) {
      report.errors.push(`teams insert: ${error.message}`);
    } else {
      for (const r of data ?? []) {
        if (r.legacy_id) teamLegacyToUuid.set(String(r.legacy_id), r.id as string);
        if (r.name) teamNameToUuid.set(r.name as string, r.id as string);
      }
    }
  }

  // ---------- Сотрудники ----------
  const { data: existingEmployees } = await supabase
    .from('employees')
    .select('legacy_id')
    .eq('owner_id', ownerId)
    .not('legacy_id', 'is', null);

  const employeeLegacy = new Set<string>((existingEmployees ?? []).map((e) => String(e.legacy_id)));

  const employeesToInsert = legacy.employees.filter((e) => !employeeLegacy.has(String(e.id)));
  report.skippedEmployees = legacy.employees.length - employeesToInsert.length;
  report.employeesToInsert = employeesToInsert.length;

  if (!dryRun && employeesToInsert.length > 0) {
    const rows = employeesToInsert.map((e) => {
      // legacy `e.team` — это имя команды, превращаем в team_id если знаем.
      const teamId = e.team ? (teamNameToUuid.get(e.team) ?? null) : null;
      // payload: всё, что не вынесено в столбцы.
      const { id: _id, fullName: _fn, role: _ro, team: _tm, ...rest } = e;
      void _id;
      void _fn;
      void _ro;
      void _tm;
      return {
        owner_id: ownerId,
        legacy_id: String(e.id),
        full_name: e.fullName,
        role: e.role,
        team_id: teamId,
        payload: rest,
      };
    });
    const { error } = await supabase.from('employees').insert(rows);
    if (error) report.errors.push(`employees insert: ${error.message}`);
  }

  return report;
}
