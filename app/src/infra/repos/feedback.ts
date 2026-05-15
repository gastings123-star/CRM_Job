import { TeamFeedbackSchema } from '@/data/schema';
import { createCollectionRepo } from './core';

/**
 * Репозиторий записей обратной связи о команде. Источники: dpo / lead /
 * peer / self. По образцу `pulseRepo` — отдельная Supabase-таблица с
 * jsonb-payload, RLS по owner_id.
 */
export const feedbackRepo = createCollectionRepo({
  entity: 'team_feedback',
  schema: TeamFeedbackSchema,
  getId: (f) => f.id,
});
