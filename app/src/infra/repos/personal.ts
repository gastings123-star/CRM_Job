import { PersonalSchema } from '@/data/schema';
import { createSingletonRepo } from './singleton';

export const personalRepo = createSingletonRepo({
  entity: 'personal',
  schema: PersonalSchema,
});
