import { TeamPulseSnapshotSchema } from '@/data/schema';
import { createCollectionRepo } from './core';

/**
 * Репозиторий снэпшотов пульса команд. Одна запись = один (teamId, weekStart).
 * Уникальность гарантируется и на клиенте (через `id`), и на сервере
 * (`team_pulse_uniq_week` индекс — см. SQL-миграцию).
 */
export const pulseRepo = createCollectionRepo({
  entity: 'team_pulse',
  schema: TeamPulseSnapshotSchema,
  getId: (p) => p.id,
});
