/**
 * Единый источник истины по навигации.
 * Любые правки путей делаются здесь — компоненты подхватывают автоматически.
 *
 * BASE учитывает `vite.base` (для GitHub Pages — `/CRM_Job/`, для dev — `/`),
 * чтобы `<Route path>` совпадал с `location.pathname` на проде.
 */
export interface RouteDef {
  path: string;
  label: string;
}

// import.meta.env.BASE_URL всегда оканчивается на '/'.
const BASE = import.meta.env.BASE_URL;
/** Объединить BASE с относительным сегментом без двойных слэшей. */
function join(seg: string): string {
  if (!seg || seg === '/') return BASE === '/' ? '/' : BASE.replace(/\/$/, '') + '/';
  return BASE.replace(/\/$/, '') + (seg.startsWith('/') ? seg : '/' + seg);
}

export const routes = {
  dashboard: { path: join('/'), label: 'Дашборд' },
  crm: { path: join('/crm'), label: 'CRM' },
  calendar: { path: join('/calendar'), label: 'Календарь' },
  development: { path: join('/development'), label: 'Развитие' },
  personal: { path: join('/personal'), label: 'Личное' },
  projects: { path: join('/projects'), label: 'Проекты' },
  settings: { path: join('/settings'), label: 'Настройки' },
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
