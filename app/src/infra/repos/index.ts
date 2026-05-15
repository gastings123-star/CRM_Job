/**
 * Барель репозиториев. Импортируйте из `@/infra/repos`.
 */
export { createCollectionRepo, type CollectionRepo, type CollectionRepoDeps } from './core';
export { createSingletonRepo, type SingletonRepo, type SingletonRepoDeps } from './singleton';
export { employeesRepo } from './employees';
export { teamsRepo } from './teams';
export { projectsRepo } from './projects';
export { personalRepo } from './personal';
export { pulseRepo } from './pulse';
export { feedbackRepo } from './feedback';
