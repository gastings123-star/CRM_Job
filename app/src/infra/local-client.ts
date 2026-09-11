import type { SupabaseClient, Session } from '@supabase/supabase-js';
export const localSession: Session = {
  access_token: 'local',
  refresh_token: 'local',
  expires_in: 0,
  token_type: 'bearer',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    app_metadata: {},
    user_metadata: {},
    aud: 'local',
    created_at: '',
    email: 'Локальный режим',
  },
};
interface Result {
  data: unknown;
  error: { message: string } | null;
}
async function request(
  table: string,
  kind: string,
  payload: unknown = {},
  id = '',
): Promise<Result> {
  try {
    const r = await fetch('/local-api/table', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, kind, payload, id }),
    });
    const value = (await r.json()) as Result;
    return value;
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}
export const localClient = {
  from(table: string) {
    return {
      select() {
        return {
          then(resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) {
            return request(table, 'select').then(resolve, reject);
          },
          eq(_key: string, id: string) {
            return { maybeSingle: () => request(table, 'single', {}, id) };
          },
        };
      },
      insert(payload: unknown) {
        return request(table, 'insert', payload);
      },
      upsert(payload: unknown) {
        return request(table, 'upsert', payload);
      },
      update(payload: unknown) {
        return { eq: (_key: string, id: string) => request(table, 'update', payload, id) };
      },
      delete() {
        return { eq: (_key: string, id: string) => request(table, 'delete', {}, id) };
      },
    };
  },
} as unknown as SupabaseClient;
