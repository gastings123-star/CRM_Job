/**
 * Импорт/экспорт данных:
 *  - JSON-бэкап всего состояния (employees + teams + projects + personal);
 *  - XLSX-экспорт списка сотрудников (плоская проекция);
 *  - XLSX-импорт сотрудников с dry-run отчётом (без записи).
 *
 * XLSX-импорт сделан в режиме «новых» сотрудников (без upsert по id),
 * под маппинг конкретного шаблона. Подключение к Supabase делает вызывающий
 * слой (UI), чтобы оставить функцию чистой и тестируемой.
 */
import * as XLSX from 'xlsx';
import { EmployeeSchema, TeamSchema, type Employee, type Team } from '@/data/schema';

// ---------------------------------------------------------------
// JSON-бэкап
// ---------------------------------------------------------------

export interface BackupBlob {
  schemaVersion: number;
  exportedAt: string;
  employees: Employee[];
  teams: Team[];
  projects: unknown[];
  personal: unknown;
}

export function buildBackup(input: Omit<BackupBlob, 'exportedAt'>): BackupBlob {
  return { ...input, exportedAt: new Date().toISOString() };
}

export function downloadBackup(blob: BackupBlob): void {
  const file = new Blob([JSON.stringify(blob, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = `staff-crm-backup-${blob.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface BackupParseResult {
  ok: boolean;
  blob: BackupBlob | null;
  errors: string[];
}

/**
 * Безопасно парсит JSON-бэкап. Не пишет в БД — это задача вызывающего слоя.
 */
export function parseBackup(text: string): BackupParseResult {
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, blob: null, errors: [`JSON parse: ${(e as Error).message}`] };
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, blob: null, errors: ['Ожидался объект на верхнем уровне'] };
  }
  const r = raw as Record<string, unknown>;
  const employees: Employee[] = [];
  if (Array.isArray(r.employees)) {
    for (const item of r.employees) {
      const parsed = EmployeeSchema.safeParse(item);
      if (parsed.success) employees.push(parsed.data);
      else errors.push(`employee: ${parsed.error.message}`);
    }
  }
  const teams: Team[] = [];
  if (Array.isArray(r.teams)) {
    for (const item of r.teams) {
      const parsed = TeamSchema.safeParse(item);
      if (parsed.success) teams.push(parsed.data);
      else errors.push(`team: ${parsed.error.message}`);
    }
  }
  const blob: BackupBlob = {
    schemaVersion: typeof r.schemaVersion === 'number' ? r.schemaVersion : 0,
    exportedAt: typeof r.exportedAt === 'string' ? r.exportedAt : '',
    employees,
    teams,
    projects: Array.isArray(r.projects) ? r.projects : [],
    personal: r.personal ?? null,
  };
  return { ok: errors.length === 0, blob, errors };
}

// ---------------------------------------------------------------
// XLSX-экспорт сотрудников
// ---------------------------------------------------------------

/** Плоская проекция сотрудника для табличного экспорта. */
export function employeeToRow(e: Employee): Record<string, string | number> {
  return {
    id: e.id,
    'ФИО': e.fullName,
    'Роль': e.role,
    'Команда': e.team,
    'Grade': e.grade,
    'Email': e.email,
    'Telegram': e.telegram,
    'Локация': e.location,
    'Дата найма': e.hireDate,
    'ДР': e.birthday,
    'ЗП': e.salary,
    'Загрузка %': e.load?.currentPercent ?? 0,
    'Риск': e.risk?.level ?? '',
    'Готовность к промо': e.promotionReadiness ?? '',
  };
}

/** Чистая функция: байты XLSX. Удобна для тестов и для отправки на сервер. */
export function employeesToXlsxBytes(employees: Employee[]): ArrayBuffer {
  const rows = employees.map(employeeToRow);
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Employees');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

export function exportEmployeesToXlsx(employees: Employee[]): Blob {
  return new Blob([employeesToXlsxBytes(employees)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function downloadEmployeesXlsx(employees: Employee[]): void {
  const blob = exportEmployeesToXlsx(employees);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `employees-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------
// XLSX-импорт (dry-run отчёт)
// ---------------------------------------------------------------

export interface XlsxImportRow {
  rowIndex: number;
  /** Кандидат на создание / обновление сотрудника. */
  candidate: Partial<Employee> | null;
  errors: string[];
}

export interface XlsxImportReport {
  total: number;
  valid: number;
  invalid: number;
  rows: XlsxImportRow[];
}

/**
 * Парсит XLSX-байты в отчёт. Не пишет в БД.
 * Поддерживает русский и английский заголовки колонок (см. `employeeToRow`).
 */
export function parseEmployeesXlsx(buffer: ArrayBuffer): XlsxImportReport {
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstName = wb.SheetNames[0];
  const sheet = firstName ? wb.Sheets[firstName] : undefined;
  if (!sheet) {
    return { total: 0, valid: 0, invalid: 0, rows: [] };
  }
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const rows: XlsxImportRow[] = json.map((raw, idx) => {
    /** Достаёт первое непустое значение и приводит к строке. */
    const pickStr = (fallback: string, ...keys: string[]): string => {
      for (const k of keys) {
        if (!(k in raw)) continue;
        const v = raw[k];
        if (v === '' || v === null || v === undefined) continue;
        if (typeof v === 'string') return v;
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        // Объекты/массивы в ячейке трактуем как пустые — это шум маппинга.
      }
      return fallback;
    };
    const pickNum = (fallback: number, ...keys: string[]): number => {
      for (const k of keys) {
        if (!(k in raw)) continue;
        const v = raw[k];
        if (v === '' || v === null || v === undefined) continue;
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isNaN(n)) return n;
      }
      return fallback;
    };
    const errors: string[] = [];
    const fullName = pickStr('', 'ФИО', 'fullName', 'Full Name').trim();
    if (!fullName) errors.push('Пустое ФИО');
    const candidate: Partial<Employee> = {
      fullName,
      role: pickStr('', 'Роль', 'role'),
      team: pickStr('', 'Команда', 'team'),
      grade: pickStr('Junior', 'Grade', 'grade'),
      email: pickStr('', 'Email', 'email'),
      telegram: pickStr('', 'Telegram', 'telegram'),
      location: pickStr('', 'Локация', 'location'),
      hireDate: pickStr('', 'Дата найма', 'hireDate'),
      birthday: pickStr('', 'ДР', 'birthday'),
      salary: pickNum(0, 'ЗП', 'salary'),
    };
    return { rowIndex: idx + 2 /* учитываем строку заголовков */, candidate, errors };
  });

  const valid = rows.filter((r) => r.errors.length === 0).length;
  return { total: rows.length, valid, invalid: rows.length - valid, rows };
}
