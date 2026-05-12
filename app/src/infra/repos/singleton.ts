/**
 * Фабрика singleton-репозиториев (один документ на пользователя — `Personal`).
 *
 * В отличие от коллекций:
 *  - id = user_id, известен только после авторизации;
 *  - в очередь идёт `upsert` (insert-or-update) на каждую мутацию;
 *  - локальный кэш — один документ (`null` если не загружали).
 */
import type { ZodType } from 'zod';
import { signal, type Signal } from '@preact/signals';
import { createStore } from '@/infra/storage';
import { supabase as defaultSupabase } from '@/infra/supabase';
import { syncQueue as defaultQueue, type SyncQueue, type SyncTable } from '@/infra/sync';
import type { SupabaseLike } from './core';

/** Расширение SupabaseLike для singleton-репо (нужен .eq + .maybeSingle). */
export interface SingletonSupabaseLike {
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
}

export interface SingletonRepoConfig<T> {
  /** Имя сущности и одновременно SyncTable. */
  entity: SyncTable;
  schema: ZodType<T>;
}

export interface SingletonRepoDeps {
  supabase?: SingletonSupabaseLike | SupabaseLike;
  queue?: SyncQueue;
  storage?: Storage;
}

export interface SingletonRepo<T> {
  readonly signal: Signal<T | null>;
  get(): T | null;
  loadFor(userId: string): Promise<void>;
  save(userId: string, value: T): void;
  patch(userId: string, partial: Partial<T>): void;
}

function resolveStorage(provided?: Storage): Storage {
  if (provided) return provided;
  if (typeof localStorage !== 'undefined') return localStorage;
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

export function createSingletonRepo<T>(
  cfg: SingletonRepoConfig<T>,
  deps: SingletonRepoDeps = {},
): SingletonRepo<T> {
  const supabase = deps.supabase ?? (defaultSupabase as unknown as SingletonSupabaseLike);
  const queue = deps.queue ?? defaultQueue;
  const storage = resolveStorage(deps.storage);

  const store = createStore({ entity: cfg.entity, schema: cfg.schema }, storage);
  const sig = signal<T | null>(store.read());

  function persist(next: T | null): void {
    sig.value = next;
    if (next) store.write(next);
    else store.clear();
  }

  async function loadFor(userId: string): Promise<void> {
    const sb = supabase as SingletonSupabaseLike;
    const { data, error } = await sb
      .from(cfg.entity)
      .select('user_id, payload')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data == null) {
      persist(null);
      return;
    }
    const row = data as { payload?: unknown };
    const parsed = cfg.schema.safeParse(row.payload);
    if (parsed.success) persist(parsed.data);
  }

  function save(userId: string, value: T): void {
    persist(value);
    queue.enqueue({
      kind: 'upsert',
      table: cfg.entity,
      id: userId,
      payload: { payload: value },
    });
  }

  function patch(userId: string, partial: Partial<T>): void {
    const current = sig.value;
    const next = { ...(current ?? ({} as T)), ...partial };
    save(userId, next);
  }

  return {
    signal: sig,
    get: () => sig.value,
    loadFor,
    save,
    patch,
  };
}
