import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock хостится наверх — кладём моки внутрь hoisted-блока.
const mocks = vi.hoisted(() => {
  const updateMock = vi.fn();
  const upsertMock = vi.fn();
  const insertMock = vi.fn();
  const deleteMock = vi.fn();
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
    insert: (row: unknown) => {
      insertMock(table, row);
      return Promise.resolve({ error: null });
    },
    delete: () => ({
      eq: (_col: string, val: string) => {
        deleteMock(table, val);
        return Promise.resolve({ error: null });
      },
    }),
  }));
  return { updateMock, upsertMock, insertMock, deleteMock, fromMock };
});

vi.mock('@/infra/supabase', () => ({
  supabase: { from: mocks.fromMock },
}));

import { SyncQueue, type QueueStorage } from '@/infra/sync';

function memStorage(): QueueStorage {
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

describe('SyncQueue', () => {
  beforeEach(() => {
    mocks.updateMock.mockClear();
    mocks.upsertMock.mockClear();
    mocks.insertMock.mockClear();
    mocks.deleteMock.mockClear();
    mocks.fromMock.mockClear();
  });

  it('enqueue update — добавляет операцию и увеличивает pending', () => {
    const q = new SyncQueue(memStorage());
    let status = q.getStatus();
    const off = q.subscribe((s) => (status = s));
    q.enqueue({ kind: 'update', table: 'employees', id: 'e1', payload: { full_name: 'A' } });
    expect(status.pending).toBe(1);
    off();
  });

  it('повторный update к той же (table, id) мерджит payload', () => {
    const q = new SyncQueue(memStorage());
    q.enqueue({ kind: 'update', table: 'employees', id: 'e1', payload: { a: 1 } });
    q.enqueue({ kind: 'update', table: 'employees', id: 'e1', payload: { b: 2 } });
    expect(q.getStatus().pending).toBe(1);
  });

  it('insert + update к той же (table, id) → один insert с merged payload', async () => {
    const q = new SyncQueue(memStorage());
    q.enqueue({ kind: 'insert', table: 'employees', id: 'e1', payload: { payload: { a: 1 } } });
    q.enqueue({ kind: 'update', table: 'employees', id: 'e1', payload: { payload: { b: 2 } } });
    expect(q.getStatus().pending).toBe(1);
    await q.flush();
    expect(mocks.insertMock).toHaveBeenCalledWith(
      'employees',
      expect.objectContaining({ id: 'e1', payload: { b: 2 } }),
    );
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });

  it('insert + delete к той же (table, id) → очередь пустеет', () => {
    const q = new SyncQueue(memStorage());
    q.enqueue({ kind: 'insert', table: 'employees', id: 'e1', payload: { payload: { a: 1 } } });
    q.enqueue({ kind: 'delete', table: 'employees', id: 'e1' });
    expect(q.getStatus().pending).toBe(0);
  });

  it('update + delete к той же (table, id) → одна delete', async () => {
    const q = new SyncQueue(memStorage());
    q.enqueue({ kind: 'update', table: 'employees', id: 'e1', payload: { a: 1 } });
    q.enqueue({ kind: 'delete', table: 'employees', id: 'e1' });
    expect(q.getStatus().pending).toBe(1);
    await q.flush();
    expect(mocks.deleteMock).toHaveBeenCalledWith('employees', 'e1');
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });

  it('flush применяет update и чистит очередь', async () => {
    const q = new SyncQueue(memStorage());
    q.enqueue({ kind: 'update', table: 'employees', id: 'e1', payload: { full_name: 'A' } });
    await q.flush();
    expect(mocks.updateMock).toHaveBeenCalledWith('employees', { full_name: 'A' });
    expect(q.getStatus().pending).toBe(0);
  });

  it('flush применяет insert', async () => {
    const q = new SyncQueue(memStorage());
    q.enqueue({ kind: 'insert', table: 'teams', id: 't1', payload: { payload: { name: 'A' } } });
    await q.flush();
    expect(mocks.insertMock).toHaveBeenCalledWith('teams', { id: 't1', payload: { name: 'A' } });
    expect(q.getStatus().pending).toBe(0);
  });

  it('flush применяет delete', async () => {
    const q = new SyncQueue(memStorage());
    q.enqueue({ kind: 'delete', table: 'projects', id: 'p1' });
    await q.flush();
    expect(mocks.deleteMock).toHaveBeenCalledWith('projects', 'p1');
    expect(q.getStatus().pending).toBe(0);
  });

  it('personal: upsert использует user_id', async () => {
    const q = new SyncQueue(memStorage());
    q.enqueue({ kind: 'upsert', table: 'personal', id: 'user-1', payload: { payload: { x: 1 } } });
    await q.flush();
    expect(mocks.upsertMock).toHaveBeenCalledWith(
      'personal',
      expect.objectContaining({ user_id: 'user-1', payload: { x: 1 } }),
    );
    expect(q.getStatus().pending).toBe(0);
  });

  it('personal: delete по user_id', async () => {
    const q = new SyncQueue(memStorage());
    q.enqueue({ kind: 'delete', table: 'personal', id: 'user-1' });
    await q.flush();
    expect(mocks.deleteMock).toHaveBeenCalledWith('personal', 'user-1');
  });

  it('миграция v1 → v2: старая очередь читается как update/upsert', () => {
    const storage = memStorage();
    storage.setItem(
      'crm:sync:queue:v1',
      JSON.stringify([
        { opId: 'a', table: 'employees', id: 'e1', patch: { full_name: 'X' } },
        { opId: 'b', table: 'personal', id: 'user-1', patch: { payload: { y: 1 } } },
      ]),
    );
    const q = new SyncQueue(storage);
    expect(q.getStatus().pending).toBe(2);
    // legacy ключ удалён
    expect(storage.getItem('crm:sync:queue:v1')).toBeNull();
  });
});
