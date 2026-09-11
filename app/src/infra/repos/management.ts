import { signal } from '@preact/signals';
import type { ZodType } from 'zod';
import { emptyManagement, ManagementSchema, type ManagementState } from '../../data/management';
import { validateManagement } from '../../domain/management';
import { LOCAL_MODE } from '../local-mode';
import { getSession } from '../auth';
import { syncQueue } from '../sync';
import { createSingletonRepo } from './singleton';
const state = signal<ManagementState>(emptyManagement());
const cloudRepo = createSingletonRepo<ManagementState, unknown>({
  entity: 'management',
  schema: ManagementSchema as unknown as ZodType<ManagementState>,
});
export const managementRepo = {
  signal: state,
  async load() {
    if (LOCAL_MODE) {
      const r = await fetch('/local-api/management');
      if (!r.ok) throw new Error('Не удалось загрузить Management OS');
      state.value = validateManagement(await r.json(), null, new Date());
      return;
    }
    const session = await getSession();
    if (!session) throw new Error('Для загрузки Management OS войдите в систему');
    await syncQueue.flush();
    await cloudRepo.loadFor(session.user.id);
    state.value = validateManagement(cloudRepo.get() ?? emptyManagement(), null, new Date());
  },
  async save(next: ManagementState, gate = false) {
    validateManagement(next, state.value, new Date(), gate);
    if (LOCAL_MODE) {
      const r = await fetch('/local-api/management', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: state.value.revision, state: next, gate }),
      });
      const result = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(result.error ?? 'Не удалось сохранить');
      state.value = result as unknown as ManagementState;
      return;
    }
    const session = await getSession();
    if (!session) throw new Error('Для сохранения Management OS войдите в систему');
    const saved = validateManagement(
      { ...next, revision: state.value.revision + 1 },
      state.value,
      new Date(),
      gate,
    );
    state.value = saved;
    cloudRepo.save(session.user.id, saved);
    await syncQueue.flush();
    const error = syncQueue.getStatus().lastError;
    if (error) throw new Error(error);
  },
};
