import type { Plugin, Connect } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import {
  EmployeeSchema,
  TeamSchema,
  ProjectSchema,
  PersonalSchema,
  TeamPulseSnapshotSchema,
  TeamFeedbackSchema,
} from './src/data/schema';
import { emptyManagement, type ManagementState } from './src/data/management';
import { validateManagement } from './src/domain/management';
const validators = {
  employees: EmployeeSchema,
  teams: TeamSchema,
  projects: ProjectSchema,
  personal: PersonalSchema,
  team_pulse: TeamPulseSnapshotSchema,
  team_feedback: TeamFeedbackSchema,
};
type Table = keyof typeof validators;
interface Row {
  id?: string;
  user_id?: string;
  payload: unknown;
}
interface DB {
  format: 'staff-crm-local-v1';
  revision: number;
  tables: Record<Table, Row[]>;
  management: ManagementState;
}
function fresh(): DB {
  return {
    format: 'staff-crm-local-v1',
    revision: 0,
    tables: {
      employees: [],
      teams: [],
      projects: [],
      personal: [],
      team_pulse: [],
      team_feedback: [],
    },
    management: emptyManagement(),
  };
}
function validateDb(raw: unknown): DB {
  const x = z
    .object({
      format: z.literal('staff-crm-local-v1'),
      revision: z.number().int().nonnegative(),
      tables: z.record(
        z.array(
          z.object({
            id: z.string().optional(),
            user_id: z.string().optional(),
            payload: z.unknown(),
          }),
        ),
      ),
      management: z.unknown(),
    })
    .parse(raw);
  for (const table of Object.keys(validators) as Table[]) {
    if (!x.tables[table]) throw new Error('Отсутствует таблица ' + table);
    const ids = new Set<string>();
    for (const r of x.tables[table]) {
      const id = table === 'personal' ? r.user_id : r.id;
      if (!id || ids.has(id)) throw new Error('Некорректный ID таблицы ' + table);
      ids.add(id);
      validators[table].parse(r.payload);
    }
  }
  return { ...x, management: validateManagement(x.management, null, new Date()) } as DB;
}
export async function localMiddleware(dir: string): Promise<Connect.NextHandleFunction> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'staff-crm.json');
  let db: DB;
  try {
    db = validateDb(JSON.parse(await readFile(file, 'utf8')));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new Error('Файл данных повреждён; перезапись остановлена. ' + String(e));
    db = fresh();
    await writeFile(file, JSON.stringify(db, null, 2), { mode: 0o600 });
  }
  let queue = Promise.resolve();
  async function save(next: DB) {
    const backups = path.join(dir, 'backups');
    await mkdir(backups, { recursive: true, mode: 0o700 });
    await writeFile(
      path.join(backups, `revision-${db.revision}.json`),
      JSON.stringify(db, null, 2),
      { mode: 0o600 },
    );
    next.revision = db.revision + 1;
    await writeFile(file + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 });
    await rename(file + '.tmp', file);
    db = next;
    const names = (await readdir(backups))
      .filter((x) => /^revision-\d+\.json$/.test(x))
      .sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));
    for (const name of names.slice(0, -30)) await unlink(path.join(backups, name));
  }
  const middleware = (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    if (!req.url?.startsWith('/local-api/')) return next();
    const send = (code: number, value: unknown) => {
      res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(value));
    };
    const host = req.headers.host ?? '';
    if (
      !/^(127\.0\.0\.1|localhost):\d+$/.test(host) ||
      (req.headers.origin && req.headers.origin !== `http://${host}`)
    ) {
      send(403, { error: 'Запрос с другого сайта запрещён' });
      return;
    }
    async function work() {
      try {
        const url = req.url!.split('?')[0];
        if (req.method === 'GET' && url === '/local-api/management')
          return send(200, db.management);
        if (req.method === 'GET' && url === '/local-api/backup') {
          res.setHeader(
            'Content-Disposition',
            'attachment; filename="staff-crm-local-backup.json"',
          );
          return send(200, db);
        }
        if (!['POST', 'PUT'].includes(req.method ?? ''))
          return send(405, { error: 'Метод не поддерживается' });
        if (!req.headers['content-type']?.startsWith('application/json'))
          return send(415, { error: 'Ожидается JSON' });
        let bytes = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of req as AsyncIterable<Uint8Array>) {
          bytes += chunk.length;
          if (bytes > 20 * 1024 * 1024) return send(413, { error: 'Файл больше 20 МБ' });
          chunks.push(Buffer.from(chunk));
        }
        const p = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
        if (url === '/local-api/management') {
          if (p.revision !== db.management.revision)
            return send(409, {
              error: 'Данные изменены в другой вкладке. Обновите раздел и повторите изменение.',
            });
          const s = validateManagement(p.state, db.management, new Date(), p.gate === true);
          const teams = new Set(db.tables.teams.map((x) => x.id)),
            employees = new Set(db.tables.employees.map((x) => x.id));
          for (const list of Object.values(s)) {
            if (!Array.isArray(list)) continue;
            for (const r of list) {
              if (r.teamId && (typeof r.teamId !== 'string' || !teams.has(r.teamId)))
                throw new Error('Команда не найдена в CRM');
              if (
                r.employeeId &&
                (typeof r.employeeId !== 'string' || !employees.has(r.employeeId))
              )
                throw new Error('Сотрудник не найден в CRM');
            }
          }
          s.revision = db.management.revision + 1;
          await save({ ...db, management: s });
          return send(200, s);
        }
        if (url === '/local-api/restore') {
          if (p.revision !== db.revision)
            return send(409, {
              error: 'Данные изменились после предпросмотра. Загрузите копию заново.',
            });
          const incoming = validateDb(p.backup);
          incoming.management.revision = db.management.revision + 1;
          await save(incoming);
          return send(200, { ok: true });
        }
        if (url === '/local-api/table') {
          const table = z
            .enum(['employees', 'teams', 'projects', 'personal', 'team_pulse', 'team_feedback'])
            .parse(p.table);
          const kind = z
            .enum(['select', 'single', 'insert', 'upsert', 'update', 'delete'])
            .parse(p.kind);
          const rows = db.tables[table],
            idKey = table === 'personal' ? 'user_id' : 'id';
          if (kind === 'select') return send(200, { data: rows, error: null });
          if (kind === 'single')
            return send(200, { data: rows.find((x) => x[idKey] === p.id) ?? null, error: null });
          const input = kind === 'delete' ? {} : z.record(z.unknown()).parse(p.payload);
          const id = z
            .string()
            .min(1)
            .parse(kind === 'insert' || kind === 'upsert' ? input[idKey] : p.id);
          const index = rows.findIndex((x) => x[idKey] === id);
          const next = structuredClone(db),
            out = next.tables[table];
          if (kind === 'delete') {
            if (
              table === 'teams' &&
              Object.values(db.management).some(
                (a) => Array.isArray(a) && a.some((r) => r.teamId === id),
              )
            )
              throw new Error(
                'Команда используется в Management OS. Сначала измените связанные записи.',
              );
            if (
              table === 'employees' &&
              Object.values(db.management).some(
                (a) => Array.isArray(a) && a.some((r) => r.employeeId === id),
              )
            )
              throw new Error(
                'Сотрудник используется в Management OS. Сначала измените связанные записи.',
              );
            if (index >= 0) out.splice(index, 1);
          } else {
            if (kind === 'update' && index < 0) throw new Error('Запись не найдена');
            const row = { ...(index >= 0 ? rows[index] : {}), ...input, [idKey]: id } as Row;
            row.payload = validators[table].parse(row.payload);
            if (index < 0) out.push(row);
            else out[index] = row;
          }
          await save(next);
          return send(200, { data: null, error: null });
        }
        send(404, { error: 'Не найдено' });
      } catch (e) {
        send(400, {
          data: null,
          error:
            req.url === '/local-api/table'
              ? { message: e instanceof Error ? e.message : String(e) }
              : e instanceof Error
                ? e.message
                : String(e),
        });
      }
    }
    queue = queue.then(work).catch((e) => send(500, { error: String(e) }));
  };
  return middleware;
}
export function localDataPlugin(): Plugin {
  const dir =
    process.env.CRM_LOCAL_DATA_DIR ?? fileURLToPath(new URL('./.local-data', import.meta.url));
  return {
    name: 'staff-crm-local-data',
    async configureServer(server) {
      server.middlewares.use(await localMiddleware(dir));
    },
    async configurePreviewServer(server) {
      server.middlewares.use(await localMiddleware(dir));
    },
  };
}
