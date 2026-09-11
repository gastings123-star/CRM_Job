// @vitest-environment node
import { z } from 'zod';
import { validateManagement } from '@/domain/management';
import { afterEach, describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { localMiddleware } from '../../local-server';
const readBackup = (raw: string) =>
  z.object({ tables: z.object({ teams: z.array(z.unknown()) }) }).parse(JSON.parse(raw));
let server: Server | undefined,
  dir = '';
async function start() {
  if (!dir) dir = await mkdtemp(path.join(tmpdir(), 'staff-mos-test-'));
  const middleware = await localMiddleware(dir);
  server = createServer((req, res) => middleware(req, res, () => res.end()));
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = '';
});
const post = (
  base: string,
  url: string,
  body: unknown,
  method = 'POST',
  headers: Record<string, string> = {},
) =>
  fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
describe('Local file storage', () => {
  it('persists CRM records on disk and reloads without Supabase', async () => {
    let base = await start();
    const result = await post(base, '/local-api/table', {
      table: 'teams',
      kind: 'insert',
      payload: { id: 't', payload: { id: 't', name: 'Команда' } },
    });
    expect(result.status).toBe(200);
    expect(((await result.json()) as { error: unknown }).error).toBe(null);
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    base = await start();
    const rows = z
      .object({ data: z.array(z.object({ payload: z.object({ name: z.string() }) })) })
      .parse(
        await (await post(base, '/local-api/table', { table: 'teams', kind: 'select' })).json(),
      );
    expect(rows.data[0]!.payload.name).toBe('Команда');
    expect(
      readBackup(await readFile(path.join(dir, 'staff-crm.json'), 'utf8')).tables.teams,
    ).toHaveLength(1);
  });
  it('rejects stale writes, invalid backups and cross-origin writes', async () => {
    const base = await start();
    const state = validateManagement(
      await (await fetch(base + '/local-api/management')).json(),
      null,
      new Date(),
    );
    state.sprintStart = '2026-09-07';
    expect((await post(base, '/local-api/management', { revision: 0, state }, 'PUT')).status).toBe(
      200,
    );
    expect((await post(base, '/local-api/management', { revision: 0, state }, 'PUT')).status).toBe(
      409,
    );
    expect(
      (
        await post(base, '/local-api/table', { table: 'teams', kind: 'select' }, 'POST', {
          Origin: 'https://example.com',
        })
      ).status,
    ).toBe(403);
    expect((await post(base, '/local-api/restore', { revision: 1, backup: {} })).status).toBe(400);
    expect(
      validateManagement(
        await (await fetch(base + '/local-api/management')).json(),
        null,
        new Date(),
      ).sprintStart,
    ).toBe('2026-09-07');
  });
  it('validates management relations and records the previous version before restore', async () => {
    const base = await start();
    const state = validateManagement(
      await (await fetch(base + '/local-api/management')).json(),
      null,
      new Date(),
    );
    state.scopes = [{ id: 's', teamId: 'missing', scope: 'full' }];
    expect((await post(base, '/local-api/management', { revision: 0, state }, 'PUT')).status).toBe(
      400,
    );
    const backup: unknown = await (await fetch(base + '/local-api/backup')).json();
    await post(base, '/local-api/table', {
      table: 'teams',
      kind: 'insert',
      payload: { id: 't', payload: { id: 't', name: 'Команда' } },
    });
    expect((await post(base, '/local-api/restore', { revision: 1, backup })).status).toBe(200);
    expect(
      readBackup(await readFile(path.join(dir, 'backups/revision-1.json'), 'utf8')).tables.teams,
    ).toHaveLength(1);
  });
});
