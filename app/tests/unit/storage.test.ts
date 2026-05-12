import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createStore } from '@/infra/storage';
import { SCHEMA_VERSION } from '@/data/schema';

const TestSchema = z.object({ name: z.string(), count: z.number().default(0) });

class MemStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key)!) : null;
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe('createStore', () => {
  let mem: MemStorage;
  beforeEach(() => {
    mem = new MemStorage();
  });

  it('возвращает null когда данных нет', () => {
    const store = createStore({ entity: 'test', schema: TestSchema }, mem);
    expect(store.read()).toBeNull();
  });

  it('пишет и читает валидное значение', () => {
    const store = createStore({ entity: 'test', schema: TestSchema }, mem);
    expect(store.write({ name: 'A', count: 1 })).toBe(true);
    expect(store.read()).toEqual({ name: 'A', count: 1 });
  });

  it('не пишет невалидное значение', () => {
    const store = createStore({ entity: 'test', schema: TestSchema }, mem);
    // Передаём заведомо невалидное значение в обход типов (runtime-проверка).
    const bad = JSON.parse('{"name":123,"count":"x"}') as z.infer<typeof TestSchema>;
    expect(store.write(bad)).toBe(false);
    expect(store.read()).toBeNull();
  });

  it('возвращает null и бэкапит повреждённые данные', () => {
    const key = `crm:v${SCHEMA_VERSION}:test`;
    mem.setItem(key, '{not json');
    const store = createStore({ entity: 'test', schema: TestSchema }, mem);
    expect(store.read()).toBeNull();
    // в backup-ключе должна остаться копия
    const backupKeys = Array.from({ length: mem.length }, (_, i) => mem.key(i)).filter((k) =>
      k?.startsWith('crm:corrupt:'),
    );
    expect(backupKeys.length).toBe(1);
  });

  it('clear удаляет значение', () => {
    const store = createStore({ entity: 'test', schema: TestSchema }, mem);
    store.write({ name: 'A', count: 1 });
    store.clear();
    expect(store.read()).toBeNull();
  });

  it('миграция с предыдущей версии срабатывает при отсутствии текущей', () => {
    const oldKey = `crm:v${SCHEMA_VERSION - 1}:test`;
    mem.setItem(oldKey, JSON.stringify({ title: 'A' }));
    const store = createStore(
      {
        entity: 'test',
        schema: TestSchema,
        migrations: [
          {
            fromVersion: SCHEMA_VERSION - 1,
            up: (legacy) => {
              const l = legacy as { title: string };
              return { name: l.title, count: 0 };
            },
          },
        ],
      },
      mem,
    );
    expect(store.read()).toEqual({ name: 'A', count: 0 });
    // и сохранилось в текущей версии
    const currentKey = `crm:v${SCHEMA_VERSION}:test`;
    expect(mem.getItem(currentKey)).not.toBeNull();
  });
});
