import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import {
  LEGACY_EMPLOYEES_KEY,
  LEGACY_TEAMS_KEY,
  migrateLegacy,
  planMigration,
  readLegacyFromJson,
  readLegacyFromStorage,
} from '@/infra/migrate-legacy';
import { createCollectionRepo } from '@/infra/repos/core';
import { SyncQueue, type QueueStorage } from '@/infra/sync';
import { EmployeeSchema, TeamSchema, type Employee, type Team } from '@/data/schema';

vi.mock('@/infra/supabase', () => ({
  supabase: { from: vi.fn() },
}));

function memDomStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? (map.get(k) ?? null) : null),
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

function memQueueStorage(): QueueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function makeRepos() {
  const queue = new SyncQueue(memQueueStorage());
  queue.stop();
  const employees = createCollectionRepo<Employee>(
    { entity: 'employees', schema: EmployeeSchema as unknown as z.ZodType<Employee>, getId: (x) => x.id },
    { queue, storage: memDomStorage() },
  );
  const teams = createCollectionRepo<Team>(
    { entity: 'teams', schema: TeamSchema as unknown as z.ZodType<Team>, getId: (x) => x.id },
    { queue, storage: memDomStorage() },
  );
  return { employees, teams, queue };
}

describe('readLegacyFromStorage', () => {
  it('читает оба ключа и парсит JSON', () => {
    const storage = memDomStorage();
    storage.setItem(LEGACY_EMPLOYEES_KEY, JSON.stringify({ employees: [{ id: 'e1' }] }));
    storage.setItem(LEGACY_TEAMS_KEY, JSON.stringify([{ id: 't1', name: 'A' }]));
    const src = readLegacyFromStorage(storage);
    expect(src.employeesBlob).toEqual({ employees: [{ id: 'e1' }] });
    expect(src.teamsBlob).toEqual([{ id: 't1', name: 'A' }]);
  });

  it('битый JSON → null, а не падение', () => {
    const storage = memDomStorage();
    storage.setItem(LEGACY_EMPLOYEES_KEY, '{not json');
    const src = readLegacyFromStorage(storage);
    expect(src.employeesBlob).toBeNull();
  });
});

describe('readLegacyFromJson', () => {
  it('массив сотрудников трактуется как { employees }', () => {
    const src = readLegacyFromJson([{ id: 'e1' }]);
    expect(src.employeesBlob).toEqual({ employees: [{ id: 'e1' }] });
    expect(src.teamsBlob).toBeNull();
  });

  it('объект с employees и teams разбирается', () => {
    const src = readLegacyFromJson({
      employees: [{ id: 'e1' }],
      teams: [{ id: 't1', name: 'A' }],
    });
    expect(src.employeesBlob).toEqual({ employees: [{ id: 'e1' }] });
    expect(src.teamsBlob).toEqual([{ id: 't1', name: 'A' }]);
  });

  it('невалидное значение → пустой источник', () => {
    expect(readLegacyFromJson('garbage')).toEqual({ employeesBlob: null, teamsBlob: null });
  });
});

describe('planMigration', () => {
  it('считает план для команд и сотрудников из легаси', () => {
    const plan = planMigration(
      {
        employeesBlob: {
          employees: [
            { id: 'L-e1', fullName: 'Иванов' },
            { id: 'L-e2', fullName: 'Петров' },
          ],
        },
        teamsBlob: [
          { id: 'L-t1', name: 'ЕФС' },
          { id: 'L-t2', name: 'Сити+' },
        ],
      },
      { teams: [], employees: [] },
    );
    expect(plan.report.employees.found).toBe(2);
    expect(plan.report.employees.toImport).toBe(2);
    expect(plan.report.teams.toImport).toBe(2);
    expect(plan.teams[0]?.id).not.toBe('L-t1'); // uuid перегенерирован
    // legacyId сохранён в payload (через passthrough)
    const t = plan.teams[0] as Team & { legacyId?: string };
    expect(t.legacyId).toBe('L-t1');
  });

  it('пропускает уже импортированные по legacyId', () => {
    const plan = planMigration(
      {
        employeesBlob: { employees: [{ id: 'L-e1', fullName: 'A' }] },
        teamsBlob: [{ id: 'L-t1', name: 'X' }],
      },
      {
        teams: [{ id: 'NEW-t1', name: 'X', color: '#fff', legacyId: 'L-t1' }],
        employees: [
          { id: 'NEW-e1', fullName: 'A', legacyId: 'L-e1' } as unknown as Employee,
        ],
      },
    );
    expect(plan.report.teams.skippedExisting).toBe(1);
    expect(plan.report.teams.toImport).toBe(0);
    expect(plan.report.employees.skippedExisting).toBe(1);
    expect(plan.report.employees.toImport).toBe(0);
  });

  it('некорректные записи копятся в errors, не валят остальное', () => {
    const plan = planMigration(
      {
        employeesBlob: { employees: [{ id: 'L-e1', fullName: 'OK' }, 'garbage', null] },
        teamsBlob: [{ id: 'L-t1', name: 'X' }, { name: '' }, 123],
      },
      { teams: [], employees: [] },
    );
    // good сотрудник остался, мусор отсеян
    expect(plan.report.employees.found).toBe(3);
    expect(plan.report.employees.toImport).toBeGreaterThanOrEqual(1);
    // невалидная команда без name отсеется
    expect(plan.report.teams.skippedInvalid).toBeGreaterThanOrEqual(1);
  });
});

describe('migrateLegacy', () => {
  it('dryRun: не пишет в репо', () => {
    const { employees, teams } = makeRepos();
    const storage = memDomStorage();
    storage.setItem(
      LEGACY_EMPLOYEES_KEY,
      JSON.stringify({ employees: [{ id: 'L-e1', fullName: 'A' }] }),
    );
    storage.setItem(LEGACY_TEAMS_KEY, JSON.stringify([{ id: 'L-t1', name: 'X' }]));
    const r = migrateLegacy({ dryRun: true, deps: { employees, teams, storage } });
    expect(r.dryRun).toBe(true);
    expect(r.employees.toImport).toBe(1);
    expect(employees.getAll().length).toBe(0);
    expect(teams.getAll().length).toBe(0);
  });

  it('apply: пишет через репо и создаёт legacy_backup', () => {
    const { employees, teams } = makeRepos();
    const storage = memDomStorage();
    storage.setItem(
      LEGACY_EMPLOYEES_KEY,
      JSON.stringify({ employees: [{ id: 'L-e1', fullName: 'A' }] }),
    );
    storage.setItem(LEGACY_TEAMS_KEY, JSON.stringify([{ id: 'L-t1', name: 'X' }]));
    const r = migrateLegacy({ dryRun: false, deps: { employees, teams, storage } });
    expect(r.dryRun).toBe(false);
    expect(employees.getAll().length).toBe(1);
    expect(teams.getAll().length).toBe(1);
    // legacy_backup ключи появились
    const backupKeys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith('legacy_backup_')) backupKeys.push(k);
    }
    expect(backupKeys.length).toBeGreaterThanOrEqual(2);
  });

  it('apply повторно — пропускает уже импортированные по legacyId', () => {
    const { employees, teams } = makeRepos();
    const storage = memDomStorage();
    storage.setItem(
      LEGACY_EMPLOYEES_KEY,
      JSON.stringify({ employees: [{ id: 'L-e1', fullName: 'A' }] }),
    );
    storage.setItem(LEGACY_TEAMS_KEY, JSON.stringify([{ id: 'L-t1', name: 'X' }]));
    migrateLegacy({ dryRun: false, deps: { employees, teams, storage } });
    const r2 = migrateLegacy({ dryRun: false, deps: { employees, teams, storage } });
    expect(r2.employees.skippedExisting).toBe(1);
    expect(r2.employees.toImport).toBe(0);
    expect(employees.getAll().length).toBe(1); // ничего не задублировалось
  });

  it('пустой источник возвращает нулевой отчёт', () => {
    const { employees, teams } = makeRepos();
    const r = migrateLegacy({ dryRun: true, deps: { employees, teams, storage: memDomStorage() } });
    expect(r.employees.found).toBe(0);
    expect(r.teams.found).toBe(0);
    expect(r.employees.toImport).toBe(0);
  });
});
