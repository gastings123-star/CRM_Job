import { TeamSchema } from '@/data/schema';
import { createCollectionRepo } from './core';

export const teamsRepo = createCollectionRepo({
  entity: 'teams',
  schema: TeamSchema,
  getId: (t) => t.id,
});
