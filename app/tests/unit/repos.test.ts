import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createCollectionRepo } from '@/infra/repos/core';
import { createSingletonRepo } from '@/infra/repos/singleton';
import { SyncQueue, type QueueStorage } from '@/infra/sync';

// vi.mock-нуть supabase, чтобы import-цепочка через @/infra/sync не пыталась
// проинициализировать реальный клиент.
vi.mock('@/infra/supabase', () => ({
  supabase: { from: vi.fn() },
}));

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

const ItemSchema = z.object({ id: z.string(), name: z.string() });
type Item = z.infer<typeof ItemSchema>;

// ---------------------------------------------------------------
// Collection repo
// ---------------------------------------------------------------

describe('createCollectionRepo', () => {
  it('create оптимистично добавляет в signal и ставит insert в очередь', () => {
    const queue = new SyncQueue(memQueueStorage());
    queue.stop(); // не запускаем интервал/listeners
    const repo = createCollectionRepo<Item>(
      { entity: 'teams', schema: ItemSchema, getId: (x) => x.id },
      { queue, storage: memDomStorage() },
    );
    repo.create({ id: 'a', name: 'Alpha' });
    expect(repo.getAll()).toEqual([{ id: 'a', name: 'Alpha' }]);
    expect(queue.getStatus().pending).toBe(1);
  });

  it('update оптимистично патчит элемент и ставит update в очередь', () => {
    const queue = new SyncQueue(memQueueStorage());
    const repo = createCollectionRepo<Item>(
      { entity: 'teams', schema: ItemSchema, getId: (x) => x.id },
      { queue, storage: memDomStorage() },
    );
    repo.create({ id: 'a', name: 'Alpha' });
    repo.update('a', { name: 'Alpha2' });
    expect(repo.getById('a')?.name).toBe('Alpha2');
    // insert + update к одной (table, id) сжимаются в один insert.
    expect(queue.getStatus().pending).toBe(1);
  });

  it('remove убирает элемент и ставит delete в очередь', () => {
    const queue = new SyncQueue(memQueueStorage());
    const repo = createCollectionRepo<Item>(
      { entity: 'projects', schema: ItemSchema, getId: (x) => x.id },
      { queue, storage: memDomStorage() },
    );
    repo.create({ id: 'a', name: 'A' });
    repo.remove('a');
    expect(repo.getAll()).toEqual([]);
    // insert + delete = noop → очередь пуста.
    expect(queue.getStatus().pending).toBe(0);
  });

  it('hydration: повторное создание репо подхватывает кэш', () => {
    const storage = memDomStorage();
    const queue = new SyncQueue(memQueueStorage());
    const repo1 = createCollectionRepo<Item>(
      { entity: 'teams', schema: ItemSchema, getId: (x) => x.id },
      { queue, storage },
    );
    repo1.create({ id: 'a', name: 'Alpha' });
    // новый инстанс репо на том же storage — читает кэш.
    const repo2 = createCollectionRepo<Item>(
      { entity: 'teams', schema: ItemSchema, getId: (x) => x.id },
      { queue, storage },
    );
    expect(repo2.getAll()).toEqual([{ id: 'a', name: 'Alpha' }]);
  });

  it('loadAll: парсит ответ supabase и обновляет signal', async () => {
    const supabase = {
      from: (_t: string) => ({
        select: (_c?: string) =>
          Promise.resolve({
            data: [
              { id: 'a', payload: { id: 'a', name: 'A' } },
              { id: 'b', payload: { id: 'b', name: 'B' } },
              { id: 'c', payload: { broken: true } }, // не пройдёт схему — пропустится
            ],
            error: null,
          }),
      }),
    };
    const queue = new SyncQueue(memQueueStorage());
    const repo = createCollectionRepo<Item>(
      { entity: 'teams', schema: ItemSchema, getId: (x) => x.id },
      { queue, supabase, storage: memDomStorage() },
    );
    await repo.loadAll();
    expect(repo.getAll()).toEqual([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ]);
  });

  it('loadAll: пробрасывает ошибку supabase', async () => {
    const supabase = {
      from: (_t: string) => ({
        select: (_c?: string) =>
          Promise.resolve({ data: null, error: { message: 'permission denied' } }),
      }),
    };
    const queue = new SyncQueue(memQueueStorage());
    const repo = createCollectionRepo<Item>(
      { entity: 'teams', schema: ItemSchema, getId: (x) => x.id },
      { queue, supabase, storage: memDomStorage() },
    );
    await expect(repo.loadAll()).rejects.toThrow('permission denied');
  });
});

// ---------------------------------------------------------------
// Singleton repo
// ---------------------------------------------------------------

const PersonalSchema = z.object({ x: z.number().optional(), y: z.string().optional() });

describe('createSingletonRepo', () => {
  it('save кладёт значение в signal и ставит upsert в очередь', () => {
    const queue = new SyncQueue(memQueueStorage());
    const repo = createSingletonRepo(
      { entity: 'personal', schema: PersonalSchema },
      { queue, storage: memDomStorage() },
    );
    repo.save('user-1', { x: 42 });
    expect(repo.get()).toEqual({ x: 42 });
    expect(queue.getStatus().pending).toBe(1);
  });

  it('patch: серия мутаций сжимается в один upsert с merged payload', () => {
    const queue = new SyncQueue(memQueueStorage());
    const repo = createSingletonRepo(
      { entity: 'personal', schema: PersonalSchema },
      { queue, storage: memDomStorage() },
    );
    repo.patch('user-1', { x: 1 });
    repo.patch('user-1', { y: 'a' });
    expect(repo.get()).toEqual({ x: 1, y: 'a' });
    expect(queue.getStatus().pending).toBe(1);
  });

  it('loadFor: тянет документ пользователя и обновляет signal', async () => {
    const supabase = {
      from: (_t: string) => ({
        select: (_c?: string) => ({
          eq: (_col: string, _val: string) => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { user_id: 'user-1', payload: { x: 7 } },
                error: null,
              }),
          }),
        }),
      }),
    };
    const queue = new SyncQueue(memQueueStorage());
    const repo = createSingletonRepo(
      { entity: 'personal', schema: PersonalSchema },
      { queue, supabase, storage: memDomStorage() },
    );
    await repo.loadFor('user-1');
    expect(repo.get()).toEqual({ x: 7 });
  });

  it('loadFor: пустой ответ оставляет signal=null', async () => {
    const supabase = {
      from: (_t: string) => ({
        select: (_c?: string) => ({
          eq: (_col: string, _val: string) => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    };
    const queue = new SyncQueue(memQueueStorage());
    const repo = createSingletonRepo(
      { entity: 'personal', schema: PersonalSchema },
      { queue, supabase, storage: memDomStorage() },
    );
    await repo.loadFor('user-1');
    expect(repo.get()).toBeNull();
  });
});
