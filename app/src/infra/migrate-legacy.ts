/**
 * Импорт данных из legacy Staff CRM в новое хранилище (Supabase + локальный кэш).
 *
 * Источники:
 *   - localStorage `staff_crm_v1`       — `{ employees: [...], selectedId? }`;
 *   - localStorage `staff_crm_teams_v1` — `Team[]`;
 *   - JSON-бэкап того же формата (поддерживается импорт из строки).
 *
 * Целевая схема:
 *   - Supabase-таблицы `employees`/`teams`/`projects` с jsonb-колонкой `payload`.
 *   - Запись идёт через `employeesRepo.create()` / `teamsRepo.create()`,
 *     то есть оптимистично в signal + кэш + очередь sync на сервер.
 *
 * Идемпотентность:
 *   - в payload каждой импортируемой записи добавляется поле `legacyId`
 *     (исходный id из legacy-стейта); при повторном запуске мы пропускаем
 *     записи, чьи `legacyId` уже встречаются в `repo.getAll()`.
 *
 * Безопасность:
 *   - `dryRun: true` по умолчанию — только считает план, ничего не пишет;
 *   - перед записью legacy-блобы бэкапятся в `legacy_backup_<key>_<ts>`;
 *   - ошибки парсинга отдельных записей не валят всю миграцию,
 *     уходят в `report.errors` и пропускают «битые» элементы.
 */
import { EmployeeSchema, TeamSchema, type Employee, type Team } from '@/data/schema';
import { employeesRepo as defaultEmployeesRepo } from './repos/employees';
import { teamsRepo as defaultTeamsRepo } from './repos/teams';
import type { CollectionRepo } from './repos/core';

export const LEGACY_EMPLOYEES_KEY = 'staff_crm_v1';
export const LEGACY_TEAMS_KEY = 'staff_crm_teams_v1';

/** Сырой материал для миграции — может прийти как из localStorage, так и из JSON. */
export interface LegacySource {
  employeesBlob: unknown;
  teamsBlob: unknown;
}

export interface SectionStats {
  /** Сколько записей нашли в источнике. */
  found: number;
  /** Сколько пройдут валидацию и будут импортированы. */
  toImport: number;
  /** Сколько пропустили (уже импортированы по legacyId). */
  skippedExisting: number;
  /** Сколько пропустили из-за ошибок валидации. */
  skippedInvalid: number;
  /** Конкретные тексты ошибок Zod (для диагностики). */
  errors: string[];
}

export interface MigrationReport {
  dryRun: boolean;
  teams: SectionStats;
  employees: SectionStats;
}

export interface MigrationPlan {
  teams: Team[];
  employees: Employee[];
  report: MigrationReport;
}

// ---------------------------------------------------------------
// Чтение источников
// ---------------------------------------------------------------

function tryParse(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Достаёт сырые блобы из браузерного localStorage. */
export function readLegacyFromStorage(storage: Storage = localStorage): LegacySource {
  return {
    employeesBlob: tryParse(storage.getItem(LEGACY_EMPLOYEES_KEY)),
    teamsBlob: tryParse(storage.getItem(LEGACY_TEAMS_KEY)),
  };
}

/**
 * Принимает распарсенный JSON-бэкап произвольной формы и пытается достать из
 * него legacy employees и teams. Принимаются варианты:
 *  - `{ employees: [...], teams: [...] }`        — общий формат экспорта;
 *  - `{ employees: [...] }` без команд;
 *  - просто массив сотрудников `[ {...}, ... ]`.
 */
export function readLegacyFromJson(parsed: unknown): LegacySource {
  if (Array.isArray(parsed)) {
    return { employeesBlob: { employees: parsed }, teamsBlob: null };
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const teamsBlob = Array.isArray(obj.teams) ? obj.teams : null;
    // `staff_crm_v1`-формат: { employees: [...] }; либо прямо { employees: [...] }
    const employeesBlob =
      'employees' in obj && Array.isArray(obj.employees)
        ? { employees: obj.employees }
        : null;
    return { employeesBlob, teamsBlob };
  }
  return { employeesBlob: null, teamsBlob: null };
}

// ---------------------------------------------------------------
// Планирование
// ---------------------------------------------------------------

/** Достаём legacyId из item, если уже импортировали — пропускаем. */
function legacyIdOf(item: { legacyId?: unknown }): string | null {
  return typeof item.legacyId === 'string' && item.legacyId.length > 0 ? item.legacyId : null;
}

function extractLegacyArray(blob: unknown, key: 'employees' | null): unknown[] {
  if (key === null) {
    return Array.isArray(blob) ? blob : [];
  }
  if (blob && typeof blob === 'object' && Array.isArray((blob as Record<string, unknown>)[key])) {
    return (blob as Record<string, unknown>)[key] as unknown[];
  }
  return [];
}

/**
 * Строит план миграции: какие legacy-записи поедут в импорт,
 * какие пропустим (дубль / битые). Ничего не пишет.
 */
export function planMigration(
  source: LegacySource,
  existing: { teams: Team[]; employees: Employee[] },
): MigrationPlan {
  const teamsStats: SectionStats = {
    found: 0,
    toImport: 0,
    skippedExisting: 0,
    skippedInvalid: 0,
    errors: [],
  };
  const employeesStats: SectionStats = {
    found: 0,
    toImport: 0,
    skippedExisting: 0,
    skippedInvalid: 0,
    errors: [],
  };

  const existingTeamLegacyIds = new Set<string>(
    existing.teams.map((t) => legacyIdOf(t as unknown as { legacyId?: unknown })).filter((x): x is string => !!x),
  );
  const existingEmployeeLegacyIds = new Set<string>(
    existing.employees
      .map((e) => legacyIdOf(e as unknown as { legacyId?: unknown }))
      .filter((x): x is string => !!x),
  );

  // --- Команды ---
  const rawTeams = extractLegacyArray(source.teamsBlob, null);
  teamsStats.found = rawTeams.length;
  const teamsToImport: Team[] = [];
  for (const raw of rawTeams) {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const legacyId = typeof obj.id === 'string' ? obj.id : null;
    if (legacyId && existingTeamLegacyIds.has(legacyId)) {
      teamsStats.skippedExisting += 1;
      continue;
    }
    // Перегенерируем uuid, прокидываем legacyId внутрь payload.
    const candidate = {
      ...obj,
      id: crypto.randomUUID(),
      legacyId: legacyId ?? undefined,
    };
    const parsed = TeamSchema.safeParse(candidate);
    if (!parsed.success) {
      teamsStats.skippedInvalid += 1;
      teamsStats.errors.push(parsed.error.issues.map((i) => i.message).join('; '));
      continue;
    }
    teamsToImport.push(parsed.data);
  }
  teamsStats.toImport = teamsToImport.length;

  // --- Сотрудники ---
  const rawEmployees = extractLegacyArray(source.employeesBlob, 'employees');
  employeesStats.found = rawEmployees.length;
  const employeesToImport: Employee[] = [];
  for (const raw of rawEmployees) {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const legacyId = typeof obj.id === 'string' ? obj.id : null;
    if (legacyId && existingEmployeeLegacyIds.has(legacyId)) {
      employeesStats.skippedExisting += 1;
      continue;
    }
    const candidate = {
      ...obj,
      id: crypto.randomUUID(),
      legacyId: legacyId ?? undefined,
      // EmployeeSchema требует `load` (без default на корне) — гарантируем хоть пустой.
      load: obj.load && typeof obj.load === 'object' ? obj.load : {},
    };
    const parsed = EmployeeSchema.safeParse(candidate);
    if (!parsed.success) {
      employeesStats.skippedInvalid += 1;
      employeesStats.errors.push(parsed.error.issues.map((i) => i.message).join('; '));
      continue;
    }
    employeesToImport.push(parsed.data);
  }
  employeesStats.toImport = employeesToImport.length;

  return {
    teams: teamsToImport,
    employees: employeesToImport,
    report: {
      dryRun: true,
      teams: teamsStats,
      employees: employeesStats,
    },
  };
}

// ---------------------------------------------------------------
// Применение плана
// ---------------------------------------------------------------

export interface MigrationDeps {
  employees?: CollectionRepo<Employee>;
  teams?: CollectionRepo<Team>;
  /** Хранилище для бэкапа legacy-блобов перед записью. */
  storage?: Storage;
}

function backupLegacy(storage: Storage, source: LegacySource): void {
  const ts = Date.now();
  if (source.employeesBlob != null) {
    try {
      storage.setItem(`legacy_backup_${LEGACY_EMPLOYEES_KEY}_${ts}`, JSON.stringify(source.employeesBlob));
    } catch {
      // overflow / private mode — игнорируем, отчёт всё равно вернётся.
    }
  }
  if (source.teamsBlob != null) {
    try {
      storage.setItem(`legacy_backup_${LEGACY_TEAMS_KEY}_${ts}`, JSON.stringify(source.teamsBlob));
    } catch {
      // ignore
    }
  }
}

export interface MigrateLegacyOptions {
  /** Если true (по умолчанию) — только считает план, ничего не пишет. */
  dryRun?: boolean;
  /** Если не передан — читаем localStorage. */
  source?: LegacySource;
  /** DI для тестов. */
  deps?: MigrationDeps;
}

/**
 * Главная точка входа. Считает план; если `dryRun=false` — применяет его
 * через репозитории (signal + кэш + sync-очередь на сервер).
 */
export function migrateLegacy(opts: MigrateLegacyOptions = {}): MigrationReport {
  const dryRun = opts.dryRun ?? true;
  const employeesRepo = opts.deps?.employees ?? defaultEmployeesRepo;
  const teamsRepo = opts.deps?.teams ?? defaultTeamsRepo;
  const storage = opts.deps?.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);

  const source: LegacySource =
    opts.source ?? (storage ? readLegacyFromStorage(storage) : { employeesBlob: null, teamsBlob: null });

  const plan = planMigration(source, {
    teams: teamsRepo.getAll(),
    employees: employeesRepo.getAll(),
  });

  if (dryRun) {
    return plan.report;
  }

  if (storage) backupLegacy(storage, source);
  for (const t of plan.teams) teamsRepo.create(t);
  for (const e of plan.employees) employeesRepo.create(e);

  return { ...plan.report, dryRun: false };
}
