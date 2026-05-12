/**
 * Базовая фабрика репозиториев-коллекций (Employee, Team, Project).
 *
 * Контракт:
 *  - источник истины для UI — сигнал `signal<T[]>`, читается через `.value`;
 *  - локальный кэш в localStorage (через `createStore`), хранит срез между сессиями;
 *  - сервер (Supabase) хранит каждую сущность в виде `{ id, payload: jsonb, owner_id }`;
 *  - мутации оптимистичны: сначала обновляем signal+cache, потом enqueue в `SyncQueue`;
 *  - `loadAll()` подтягивает свежие данные с сервера и перезаписывает signal+cache;
 *  - конфликт-резолюция: last-writer-wins (триггер `updated_at` на сервере).
 *
 * Намеренно ограниченный scope:
 *  - нет realtime-подписок, нет diff-кэширования между загрузками;
 *  - нет partial-update jsonb на стороне сервера — отправляем полный payload;
 *  - для DI/тестов `deps` принимает мок supabase и SyncQueue.
 */
import { z, type ZodType } from 'zod';
import { signal, type Signal } from '@preact/signals';
import { createStore } from '@/infra/storage';
import { supabase as defaultSupabase } from '@/infra/supabase';
import { syncQueue as defaultQueue, type SyncQueue, type SyncTable } from '@/infra/sync';

/** Минимальный контракт supabase, используемый репозиторием (для тестов). */
export interface SupabaseLike {
  from(table: string): {
    select(cols?: string): Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

export interface CollectionRepoConfig<T> {
  /** Имя сущности (логическое, без префиксов). Используется и как имя таблицы. */
  entity: SyncTable;
  /** Zod-схема одного элемента. Должна включать поле `id: string`. */
  schema: ZodType<T>;
  /** Извлекатель id (схема может варьироваться). */
  getId: (item: T) => string;
}

export interface CollectionRepoDeps {
  supabase?: SupabaseLike;
  queue?: SyncQueue;
  /** DI для storage, чтобы тесты не лезли в реальный localStorage. */
  storage?: Storage;
}

export interface CollectionRepo<T> {
  /** Реактивный список — UI читает `.value`, обновляется при мутациях. */
  readonly signal: Signal<T[]>;
  /** Текущий снимок. */
  getAll(): T[];
  /** Поиск по id. */
  getById(id: string): T | undefined;
  /** Полная перезагрузка с сервера. Обновляет signal + локальный кэш. */
  loadAll(): Promise<void>;
  /** Оптимистично создаёт элемент и ставит insert в очередь. */
  create(item: T): void;
  /** Оптимистично обновляет элемент и ставит update в очередь. */
  update(id: string, patch: Partial<T>): void;
  /** Оптимистично удаляет элемент и ставит delete в очередь. */
  remove(id: string): void;
}

/** Безопасный fallback на in-memory Storage, когда localStorage недоступен. */
function memoryFallback(): Storage {
  const map = new Map<string, string>();
  const storage: Storage = {
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
  return storage;
}

function resolveStorage(provided?: Storage): Storage {
  if (provided) return provided;
  if (typeof localStorage !== 'undefined') return localStorage;
  return memoryFallback();
}

export function createCollectionRepo<T>(
  cfg: CollectionRepoConfig<T>,
  deps: CollectionRepoDeps = {},
): CollectionRepo<T> {
  const supabase = deps.supabase ?? (defaultSupabase as unknown as SupabaseLike);
  const queue = deps.queue ?? defaultQueue;
  const storage = resolveStorage(deps.storage);

  const listSchema = z.array(cfg.schema);
  const store = createStore({ entity: cfg.entity, schema: listSchema }, storage);

  const sig = signal<T[]>(store.read() ?? []);

  function persist(next: T[]): void {
    sig.value = next;
    store.write(next);
  }

  async function loadAll(): Promise<void> {
    const { data, error } = await supabase.from(cfg.entity).select('id, payload');
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) return;
    // Сервер хранит элемент в jsonb-колонке `payload`; в кэше — плоский T.
    const items: T[] = [];
    for (const row of data) {
      const r = row as { id?: unknown; payload?: unknown };
      const parsed = cfg.schema.safeParse(r.payload);
      if (parsed.success) items.push(parsed.data);
    }
    persist(items);
  }

  function create(item: T): void {
    const id = cfg.getId(item);
    persist([...sig.value, item]);
    queue.enqueue({
      kind: 'insert',
      table: cfg.entity,
      id,
      payload: { payload: item },
    });
  }

  function update(id: string, patch: Partial<T>): void {
    const idx = sig.value.findIndex((x) => cfg.getId(x) === id);
    if (idx < 0) return;
    const current = sig.value[idx]!;
    const next = { ...current, ...patch };
    const list = [...sig.value];
    list[idx] = next;
    persist(list);
    queue.enqueue({
      kind: 'update',
      table: cfg.entity,
      id,
      payload: { payload: next },
    });
  }

  function remove(id: string): void {
    if (!sig.value.some((x) => cfg.getId(x) === id)) return;
    persist(sig.value.filter((x) => cfg.getId(x) !== id));
    queue.enqueue({ kind: 'delete', table: cfg.entity, id });
  }

  return {
    signal: sig,
    getAll: () => sig.value,
    getById: (id) => sig.value.find((x) => cfg.getId(x) === id),
    loadAll,
    create,
    update,
    remove,
  };
}
