/**
 * Очередь записи в Supabase с дифф-сохранением.
 *
 * Контракт:
 *  - UI вызывает `enqueue({ table, id, patch })` — операция кладётся в очередь;
 *  - очередь дренится при `online`-событии и периодически (interval);
 *  - конфликт-резолюция: last-writer-wins по `updated_at` на сервере (через триггер);
 *  - порядок операций сохраняется в рамках одной `(table, id)` пары;
 *  - все операции персистятся в localStorage до подтверждения сервером,
 *    чтобы пережить перезагрузку вкладки.
 *
 * Намеренные упрощения этапа 2:
 *  - используем localStorage, а не IndexedDB (объём очереди мал, скорость не критична);
 *  - дифф приходит снаружи готовый — `sync.ts` его не вычисляет (расчёт ближе к UI).
 */
import { supabase } from './supabase';

export type SyncTable = 'employees' | 'teams' | 'projects' | 'personal';

export interface SyncOp {
  /** Стабильный id операции для дедупликации. */
  opId: string;
  table: SyncTable;
  /** Для `personal` это `user_id`, иначе — uuid строки. */
  id: string;
  /** Частичное обновление столбцов / `payload` jsonb. */
  patch: Record<string, unknown>;
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

const QUEUE_KEY = 'crm:sync:queue:v1';
const MAX_ATTEMPTS = 5;
const FLUSH_INTERVAL_MS = 15_000;

/** Минимальный контракт хранилища (для DI и тестов). */
export interface QueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** In-memory fallback, если localStorage недоступен (jsdom, SSR). */
function memoryStorage(): QueueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k)!) : null),
    setItem: (k, v) => {
      map.set(k, v);
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
    this.status = {
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      pending: this.readQueue().length,
      lastError: null,
      lastFlushAt: null,
    };
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

  enqueue(op: Omit<SyncOp, 'enqueuedAt' | 'attempts' | 'opId'> & { opId?: string }): void {
    const queue = this.readQueue();
    // Сжатие: если в хвосте есть операция к той же (table, id) — мерджим patch.
    const last = queue[queue.length - 1];
    if (last?.table === op.table && last.id === op.id) {
      last.patch = { ...last.patch, ...op.patch };
      this.writeQueue(queue);
      this.update({ pending: queue.length });
      return;
    }
    queue.push({
      opId: op.opId ?? crypto.randomUUID(),
      table: op.table,
      id: op.id,
      patch: op.patch,
      enqueuedAt: Date.now(),
      attempts: 0,
    });
    this.writeQueue(queue);
    this.update({ pending: queue.length });
    if (this.status.online) void this.flush();
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
          // dead-letter: сохраняем отдельно и выкидываем из очереди,
          // чтобы битая операция не блокировала остальные.
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
      const { error } = await supabase
        .from('personal')
        .upsert({ user_id: op.id, ...op.patch }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
      return;
    }
    const { error } = await supabase.from(op.table).update(op.patch).eq('id', op.id);
    if (error) throw new Error(error.message);
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

export const syncQueue = new SyncQueue();
