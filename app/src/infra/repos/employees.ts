import { EmployeeSchema } from '@/data/schema';
import { createCollectionRepo } from './core';

export const employeesRepo = createCollectionRepo({
  entity: 'employees',
  schema: EmployeeSchema,
  getId: (e) => e.id,
});
