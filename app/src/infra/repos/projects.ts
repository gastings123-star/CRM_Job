import { ProjectSchema } from '@/data/schema';
import { createCollectionRepo } from './core';

export const projectsRepo = createCollectionRepo({
  entity: 'projects',
  schema: ProjectSchema,
  getId: (p) => p.id,
});
