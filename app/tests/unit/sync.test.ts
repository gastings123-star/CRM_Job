import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock хостится наверх — кладём моки внутрь hoisted-блока.
const mocks = vi.hoisted(() => {
  const updateMock = vi.fn();
  const upsertMock = vi.fn();
  const fromMock = vi.fn((table: string) => ({
    update: (patch: unknown) => ({
      eq: (_col: string, _val: string) => {
        updateMock(table, patch);
        return Promise.resolve({ error: null });
      },
    }),
    upsert: (row: unknown, _opts: unknown) => {
      upsertMock(table, row);
      return Promise.resolve({ error: null });
    },
  }));
  return { updateMock, upsertMock, fromMock };
});

vi.mock('@/infra/supabase', () => ({
  supabase: { from: mocks.fromMock },
}));

import { SyncQueue, type QueueStorage } from '@/infra/sync';

function memStorage(): QueueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k)!) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe('SyncQueue', () => {
  beforeEach(() => {
    mocks.updateMock.mockClear();
    mocks.upsertMock.mockClear();
    mocks.fromMock.mockClear();
  });

  it('enqueue добавляет операцию и увеличивает pending', () => {
    const q = new SyncQueue(memStorage());
    let status = q.getStatus();
    const off = q.subscribe((s) => (status = s));
    q.enqueue({ table: 'employees', id: 'e1', patch: { full_name: 'A' } });
    expect(status.pending).toBe(1);
    off();
  });

  it('повторный enqueue к той же (table, id) мерджит patch', () => {
    const q = new SyncQueue(memStorage());
    q.enqueue({ table: 'employees', id: 'e1', patch: { a: 1 } });
    q.enqueue({ table: 'employees', id: 'e1', patch: { b: 2 } });
    expect(q.getStatus().pending).toBe(1);
  });

  it('flush применяет update и чистит очередь', async () => {
    const q = new SyncQueue(memStorage());
    // online без window-listeners — навигатор по умолчанию онлайн в jsdom.
    q.enqueue({ table: 'employees', id: 'e1', patch: { full_name: 'A' } });
    await q.flush();
    expect(mocks.updateMock).toHaveBeenCalledWith('employees', { full_name: 'A' });
    expect(q.getStatus().pending).toBe(0);
  });

  it('personal использует upsert по user_id', async () => {
    const q = new SyncQueue(memStorage());
    q.enqueue({ table: 'personal', id: 'user-1', patch: { payload: { x: 1 } } });
    await q.flush();
    expect(mocks.upsertMock).toHaveBeenCalledWith(
      'personal',
      expect.objectContaining({ user_id: 'user-1', payload: { x: 1 } }),
    );
    expect(q.getStatus().pending).toBe(0);
  });
});
