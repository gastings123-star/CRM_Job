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
  teams: { path: join('/teams'), label: 'Команды' },
  pulse: { path: join('/pulse'), label: 'Пульс' },
  tasks: { path: join('/tasks'), label: 'Задачи' },
  calendar: { path: join('/calendar'), label: 'Календарь' },
  development: { path: join('/development'), label: 'Развитие' },
  personal: { path: join('/personal'), label: 'Личное' },
  projects: { path: join('/projects'), label: 'Проекты' },
  settings: { path: join('/settings'), label: 'Настройки' },
} as const satisfies Record<string, RouteDef>;

export type RouteKey = keyof typeof routes;

/** Шаблон детальной страницы сотрудника. Не в `routes`, т.к. не показывается в навигации. */
export const employeeDetailPath = join('/crm/:id');

/** Сборка ссылки на конкретного сотрудника. */
export function employeeUrl(id: string): string {
  return join('/crm/' + id);
}

/** Шаблон страницы команды. Тоже не в навигации (показывается из /teams). */
export const teamDetailPath = join('/teams/:id');

export function teamUrl(id: string): string {
  return join('/teams/' + id);
}

export const navItems: RouteKey[] = [
  'dashboard',
  'crm',
  'teams',
  'pulse',
  'tasks',
  'calendar',
  'development',
  'personal',
  'projects',
  'settings',
];
