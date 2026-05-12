/**
 * Очередь записи в Supabase с поддержкой insert/update/delete/upsert.
 *
 * Контракт:
 *  - UI/репозитории вызывают `enqueue({ kind, table, id, payload? })`;
 *  - очередь дренится при `online`-событии и периодически (interval);
 *  - порядок операций сохраняется в рамках одной `(table, id)` пары;
 *  - смежные операции к той же `(table, id)` компрессируются:
 *      insert+update → insert(merged), insert+delete → noop,
 *      update+delete → delete, update+update → merged, upsert+upsert → merged;
 *  - все операции персистятся в localStorage до подтверждения сервером,
 *    чтобы пережить перезагрузку вкладки;
 *  - конфликт-резолюция: last-writer-wins по `updated_at` на сервере (триггер).
 *
 * Модель строк в БД (соглашение):
 *  - `employees | teams | projects`: `{ id uuid, owner_id uuid, payload jsonb, ... }`;
 *  - `personal`: `{ user_id uuid PK, payload jsonb, ... }`;
 *  - `owner_id` проставляется триггером БД из `auth.uid()` (RLS).
 */
import { supabase } from './supabase';

export type SyncTable = 'employees' | 'teams' | 'projects' | 'personal';

export type SyncKind = 'insert' | 'update' | 'delete' | 'upsert';

export interface SyncOp {
  /** Стабильный id операции для дедупликации. */
  opId: string;
  table: SyncTable;
  /** Для `personal` это `user_id`, иначе — uuid строки. */
  id: string;
  kind: SyncKind;
  /** Колонки/payload для записи. Для `delete` не используется. */
  payload: Record<string, unknown>;
  /** Метка для отладки: момент постановки в очередь (мс). */
  enqueuedAt: number;
  /** Количество неуспешных попыток. */
  attempts: number;
}

export interface SyncStatus {
  online: boolean;
  pending: number;
  lastError: string | null;
  lastFlushAt: number | null;
}

const QUEUE_KEY = 'crm:sync:queue:v2';
const LEGACY_QUEUE_KEY = 'crm:sync:queue:v1';
const MAX_ATTEMPTS = 5;
const FLUSH_INTERVAL_MS = 15_000;

/** Минимальный контракт хранилища (для DI и тестов). */
export interface QueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** In-memory fallback, если localStorage недоступен (jsdom, SSR). */
function memoryStorage(): QueueStorage {
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

function safeLocalStorage(): QueueStorage {
  if (typeof localStorage === 'undefined') return memoryStorage();
  try {
    const probe = '__crm_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem?.(probe);
    return localStorage;
  } catch {
    return memoryStorage();
  }
}

type Listener = (status: SyncStatus) => void;

/** Аргумент пользовательского `enqueue` — payload опционален для delete. */
export interface EnqueueInput {
  table: SyncTable;
  id: string;
  kind: SyncKind;
  payload?: Record<string, unknown>;
  opId?: string;
}

export class SyncQueue {
  private storage: QueueStorage;
  private listeners = new Set<Listener>();
  private status: SyncStatus;
  private flushingPromise: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private boundOnline = () => {
    this.update({ online: true });
    void this.flush();
  };
  private boundOffline = () => this.update({ online: false });

  constructor(storage?: QueueStorage) {
    this.storage = storage ?? safeLocalStorage();
    this.migrateLegacy();
    this.status = {
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      pending: this.readQueue().length,
      lastError: null,
      lastFlushAt: null,
    };
  }

  /** Однократная миграция очереди v1 (без `kind`) → v2 (kind='update'). */
  private migrateLegacy(): void {
    const legacy = this.storage.getItem(LEGACY_QUEUE_KEY);
    if (!legacy) return;
    if (this.storage.getItem(QUEUE_KEY)) {
      // v2 уже есть — не перетираем
      this.storage.removeItem?.(LEGACY_QUEUE_KEY);
      return;
    }
    try {
      const parsed = JSON.parse(legacy) as {
        opId?: string;
        table: SyncTable;
        id: string;
        patch?: Record<string, unknown>;
        enqueuedAt?: number;
        attempts?: number;
      }[];
      const migrated: SyncOp[] = parsed.map((o) => ({
        opId: o.opId ?? crypto.randomUUID(),
        table: o.table,
        id: o.id,
        kind: o.table === 'personal' ? 'upsert' : 'update',
        payload: o.patch ?? {},
        enqueuedAt: o.enqueuedAt ?? Date.now(),
        attempts: o.attempts ?? 0,
      }));
      this.storage.setItem(QUEUE_KEY, JSON.stringify(migrated));
      this.storage.removeItem?.(LEGACY_QUEUE_KEY);
    } catch {
      // битый v1 — просто игнорируем и удаляем
      this.storage.removeItem?.(LEGACY_QUEUE_KEY);
    }
  }

  private readQueue(): SyncOp[] {
    try {
      const raw = this.storage.getItem(QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as SyncOp[]) : [];
    } catch {
      return [];
    }
  }

  private writeQueue(ops: SyncOp[]): void {
    try {
      this.storage.setItem(QUEUE_KEY, JSON.stringify(ops));
    } catch {
      // overflow → ignore; статус всё равно увидит pending.
    }
  }

  start(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', this.boundOnline);
    window.addEventListener('offline', this.boundOffline);
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    // первая попытка сразу
    void this.flush();
  }

  stop(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('online', this.boundOnline);
    window.removeEventListener('offline', this.boundOffline);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  /** Снимок текущих операций (read-only). Используется репозиториями при merge. */
  getOps(): readonly SyncOp[] {
    return this.readQueue();
  }

  enqueue(input: EnqueueInput): void {
    const queue = this.readQueue();
    const newOp: SyncOp = {
      opId: input.opId ?? crypto.randomUUID(),
      table: input.table,
      id: input.id,
      kind: input.kind,
      payload: input.payload ?? {},
      enqueuedAt: Date.now(),
      attempts: 0,
    };
    const compressed = compressTail(queue, newOp);
    this.writeQueue(compressed);
    this.update({ pending: compressed.length });
    // Откладываем flush на microtask, чтобы серия synchronous enqueue
    // успела сжаться до старта сетевого запроса.
    if (this.status.online) queueMicrotask(() => void this.flush());
  }

  flush(): Promise<void> {
    if (this.flushingPromise) return this.flushingPromise;
    if (!this.status.online) return Promise.resolve();
    this.flushingPromise = this.runFlush().finally(() => {
      this.flushingPromise = null;
    });
    return this.flushingPromise;
  }

  private async runFlush(): Promise<void> {
    // Дренаж по одной операции — порядок важен.
    while (true) {
      const queue = this.readQueue();
      const head = queue[0];
      if (!head) break;
      try {
        await this.apply(head);
        queue.shift();
        this.writeQueue(queue);
        this.update({ pending: queue.length, lastError: null, lastFlushAt: Date.now() });
      } catch (e) {
        head.attempts += 1;
        if (head.attempts >= MAX_ATTEMPTS) {
          this.deadLetter(head, e);
          queue.shift();
          this.writeQueue(queue);
          this.update({
            pending: queue.length,
            lastError: e instanceof Error ? e.message : String(e),
            lastFlushAt: Date.now(),
          });
          continue;
        }
        this.writeQueue(queue);
        this.update({
          lastError: e instanceof Error ? e.message : String(e),
          lastFlushAt: Date.now(),
        });
        break; // ретрай — на следующем тике
      }
    }
  }

  private async apply(op: SyncOp): Promise<void> {
    if (op.table === 'personal') {
      // Personal — один документ на пользователя, ключ user_id.
      if (op.kind === 'delete') {
        const { error } = await supabase.from('personal').delete().eq('user_id', op.id);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await supabase
        .from('personal')
        .upsert({ user_id: op.id, ...op.payload }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
      return;
    }
    switch (op.kind) {
      case 'insert': {
        const { error } = await supabase.from(op.table).insert({ id: op.id, ...op.payload });
        if (error) throw new Error(error.message);
        return;
      }
      case 'upsert': {
        const { error } = await supabase
          .from(op.table)
          .upsert({ id: op.id, ...op.payload }, { onConflict: 'id' });
        if (error) throw new Error(error.message);
        return;
      }
      case 'update': {
        const { error } = await supabase.from(op.table).update(op.payload).eq('id', op.id);
        if (error) throw new Error(error.message);
        return;
      }
      case 'delete': {
        const { error } = await supabase.from(op.table).delete().eq('id', op.id);
        if (error) throw new Error(error.message);
        return;
      }
    }
  }

  private deadLetter(op: SyncOp, e: unknown): void {
    try {
      const key = `crm:sync:dead:${Date.now()}:${op.opId}`;
      this.storage.setItem(
        key,
        JSON.stringify({ op, error: e instanceof Error ? e.message : String(e) }),
      );
    } catch {
      // ignore
    }
  }

  private update(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn(this.status);
  }
}

/**
 * Компрессия очереди: если последняя операция к той же `(table, id)`,
 * пытаемся свернуть пару в одну, не нарушая семантики.
 */
function compressTail(queue: SyncOp[], next: SyncOp): SyncOp[] {
  const last = queue[queue.length - 1];
  if (last?.table !== next.table || last.id !== next.id) {
    return [...queue, next];
  }
  const head = queue.slice(0, -1);

  // insert + delete = noop
  if (last.kind === 'insert' && next.kind === 'delete') return head;
  // update + delete = delete
  if (last.kind === 'update' && next.kind === 'delete') return [...head, next];
  // delete + insert = upsert (на всякий — переписываем содержимое)
  if (last.kind === 'delete' && next.kind === 'insert') {
    return [...head, { ...next, kind: 'upsert' }];
  }
  // insert + update = insert (merged payload)
  if (last.kind === 'insert' && next.kind === 'update') {
    return [...head, { ...last, payload: { ...last.payload, ...next.payload } }];
  }
  // update + update = merged update
  if (last.kind === 'update' && next.kind === 'update') {
    return [...head, { ...last, payload: { ...last.payload, ...next.payload } }];
  }
  // upsert + upsert = merged upsert
  if (last.kind === 'upsert' && next.kind === 'upsert') {
    return [...head, { ...last, payload: { ...last.payload, ...next.payload } }];
  }
  // прочие переходы — не сжимаем
  return [...queue, next];
}

export const syncQueue = new SyncQueue();
