import type { JSX } from 'preact';
import { useLocation, useRoute } from 'preact-iso';
import { useMemo, useState } from 'preact/hooks';
import { employeesRepo } from '@/infra/repos';
import { routes } from '@/app/routes';
import { Tabs, type TabItem } from '@/ui/components/Tabs';
import { Button } from '@/ui/components/Button';
import { BasicInfoTab } from './tabs/BasicInfoTab';
import { LoadTab } from './tabs/LoadTab';
import { SkillsTab } from './tabs/SkillsTab';
import { GoalsTab } from './tabs/GoalsTab';
import { TasksTab } from './tabs/TasksTab';
import { OneOnOneTab } from './tabs/OneOnOneTab';

/**
 * Экран `/crm/:id` — карточка одного сотрудника с табами.
 *
 * На текущем этапе работают вкладки «Основная информация» и «Загрузка».
 * Остальные вкладки отображаются заголовками с пометкой «скоро» — порядок
 * и набор соответствуют легаси-приложению, чтобы пользователю было привычно.
 */
const TABS: TabItem[] = [
  { id: 'basic', label: '1. Основная информация' },
  { id: 'load', label: '2. Загрузка' },
  { id: 'skills', label: '3. Навыки' },
  { id: 'projects', label: '4. История проектов', disabled: true },
  { id: 'extra', label: '5. Дополнительно', disabled: true },
  { id: 'tasks', label: '6. Задачи' },
  { id: 'oneonone', label: '7. 1-on-1' },
  { id: 'goals', label: '8. Цели' },
];

export function EmployeeDetailScreen(): JSX.Element {
  const { params } = useRoute();
  const loc = useLocation();
  const id = params.id ?? '';
  const employees = employeesRepo.signal.value;
  const employee = useMemo(() => employees.find((e) => e.id === id) ?? null, [employees, id]);
  const [active, setActive] = useState<string>('basic');

  if (!employee) {
    return (
      <div class="space-y-4">
        <Button variant="secondary" onClick={() => loc.route(routes.crm.path)}>
          ← К списку
        </Button>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
          Сотрудник не найден. Возможно, удалён или ещё не подгрузился — попробуйте обновить страницу.
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-6">
      <header class="flex items-center gap-4">
        <Button variant="secondary" size="sm" onClick={() => loc.route(routes.crm.path)}>
          ← К списку
        </Button>
        <Avatar name={employee.fullName} />
        <div>
          <h2 class="text-2xl font-semibold leading-tight">
            {employee.fullName || <span class="text-slate-500">— без имени —</span>}
          </h2>
          <p class="text-sm text-slate-400">
            {[employee.role, employee.team || 'без команды', employee.grade]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </header>

      <Tabs items={TABS} active={active} onChange={setActive} />

      <div role="tabpanel">
        {active === 'basic' && <BasicInfoTab employee={employee} />}
        {active === 'load' && <LoadTab employee={employee} />}
        {active === 'skills' && <SkillsTab employee={employee} />}
        {active === 'tasks' && <TasksTab employee={employee} />}
        {active === 'oneonone' && <OneOnOneTab employee={employee} />}
        {active === 'goals' && <GoalsTab employee={employee} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Аватар с инициалами
// ---------------------------------------------------------------

function Avatar({ name }: { name: string }): JSX.Element {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  // Стабильный цвет: сумма кодов символов → один из 6 цветов.
  const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const palette = [
    'bg-blue-500/30 text-blue-200',
    'bg-purple-500/30 text-purple-200',
    'bg-emerald-500/30 text-emerald-200',
    'bg-amber-500/30 text-amber-200',
    'bg-rose-500/30 text-rose-200',
    'bg-sky-500/30 text-sky-200',
  ];
  const color = palette[hash % palette.length];
  return (
    <div
      class={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${color}`}
      aria-hidden="true"
    >
      {initials || '?'}
    </div>
  );
}
