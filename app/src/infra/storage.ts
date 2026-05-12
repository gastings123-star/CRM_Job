/**
 * Типизированный слой над localStorage с версионированием и Zod-валидацией.
 *
 * Соглашения:
 *  - Ключ хранения:    `crm:v<SCHEMA_VERSION>:<entity>`.
 *  - Перед записью значение валидируется схемой Zod.
 *  - При чтении: если данных нет — возвращается `null`; если повреждены —
 *    исходное значение бэкапится в `crm:corrupt:<key>:<ts>`, метод возвращает `null`.
 *  - Миграция с предыдущей версии запускается лениво при первом `read()`.
 *
 * Реализация целенаправленно держится тонкой: storage хранит «срез истины»
 * между сессиями, основной источник — Supabase. См. `sync.ts`.
 */
import type { ZodType, ZodTypeDef } from 'zod';
import { SCHEMA_VERSION } from '@/data/schema';

const NS = 'crm';

function key(entity: string, version: number = SCHEMA_VERSION): string {
  return `${NS}:v${version}:${entity}`;
}

function safeGet(storage: Storage, k: string): string | null {
  try {
    return storage.getItem(k);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, k: string, value: string): boolean {
  try {
    storage.setItem(k, value);
    return true;
  } catch {
    return false;
  }
}

function backupCorrupt(storage: Storage, k: string, raw: string): void {
  const ts = Date.now();
  safeSet(storage, `${NS}:corrupt:${k}:${ts}`, raw);
}

export interface StorageEntry<T, In = T> {
  /** Логическое имя сущности — без префикса/версии. */
  entity: string;
  /** Zod-схема для валидации. */
  schema: ZodType<T, ZodTypeDef, In>;
  /** Опциональный мигратор предыдущих версий, по убыванию `fromVersion`. */
  migrations?: {
    fromVersion: number;
    /** Получает уже распаршенный JSON предыдущей версии и должен вернуть JSON текущей. */
    up: (legacy: unknown) => unknown;
  }[];
}

export function createStore<T, In = T>(
  entry: StorageEntry<T, In>,
  storage: Storage = localStorage,
) {
  const currentKey = key(entry.entity);

  function migrate(): unknown {
    if (!entry.migrations || entry.migrations.length === 0) return null;
    // Пытаемся последовательно поднять данные с предыдущих версий.
    const sorted = [...entry.migrations].sort((a, b) => b.fromVersion - a.fromVersion);
    for (const m of sorted) {
      const prevKey = key(entry.entity, m.fromVersion);
      const raw = safeGet(storage, prevKey);
      if (!raw) continue;
      try {
        const legacy = JSON.parse(raw) as unknown;
        let next = m.up(legacy);
        // Если миграция оставила не последнюю версию — последующие миграции
        // отработают на текущем проходе через рекурсивный спуск по списку.
        for (const further of sorted.filter((x) => x.fromVersion > m.fromVersion)) {
          next = further.up(next);
        }
        return next;
      } catch {
        // Битые данные предыдущей версии — игнорируем, пробуем дальше.
        continue;
      }
    }
    return null;
  }

  function read(): T | null {
    const raw = safeGet(storage, currentKey);
    if (raw) {
      try {
        const parsed = entry.schema.safeParse(JSON.parse(raw));
        if (parsed.success) return parsed.data;
        backupCorrupt(storage, currentKey, raw);
        return null;
      } catch {
        backupCorrupt(storage, currentKey, raw);
        return null;
      }
    }
    // Ничего нет — пытаемся мигрировать.
    const migrated = migrate();
    if (migrated == null) return null;
    const parsed = entry.schema.safeParse(migrated);
    if (!parsed.success) return null;
    write(parsed.data);
    return parsed.data;
  }

  function write(value: T): boolean {
    const parsed = entry.schema.safeParse(value);
    if (!parsed.success) return false;
    return safeSet(storage, currentKey, JSON.stringify(parsed.data));
  }

  function clear(): void {
    try {
      storage.removeItem(currentKey);
    } catch {
      // ignore
    }
  }

  return { read, write, clear, key: currentKey };
}
