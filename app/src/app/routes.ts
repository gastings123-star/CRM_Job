/**
 * Единый источник истины по навигации.
 * Любые правки путей делаются здесь — компоненты подхватывают автоматически.
 */
export interface RouteDef {
  path: string;
  label: string;
}

export const routes = {
  dashboard: { path: '/', label: 'Дашборд' },
  crm: { path: '/crm', label: 'CRM' },
  calendar: { path: '/calendar', label: 'Календарь' },
  development: { path: '/development', label: 'Развитие' },
  personal: { path: '/personal', label: 'Личное' },
  projects: { path: '/projects', label: 'Проекты' },
  settings: { path: '/settings', label: 'Настройки' },
} as const satisfies Record<string, RouteDef>;

export type RouteKey = keyof typeof routes;

export const navItems: RouteKey[] = [
  'dashboard',
  'crm',
  'calendar',
  'development',
  'personal',
  'projects',
  'settings',
];
