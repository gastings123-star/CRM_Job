import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { employeesRepo } from '@/infra/repos';
import { employeeUrl } from '@/app/routes';
import { TextInput } from '@/ui/components/Field';
import { toast } from '@/state/ui';
import {
  applyFilter,
  buildGlobalTasks,
  sortByUrgency,
  type GlobalTask,
  type TaskFilter,
} from '@/domain/global-tasks';

/**
 * Экран `/tasks` — сводная лента задач по всем сотрудникам.
 *
 * Фильтры (быстрые чипы): Все / Открытые / Просрочены / 7 дней /
 * 30 дней / Без дедлайна / Закрытые. Сортировка — по urgency
 * (просрочено → скоро → без даты → done в конце).
 *
 * Inline-управление:
 *  - чекбокс «выполнена» переключает status одной задачи;
 *  - клик по ФИО — переход в карточку сотрудника на вкладку 6 (Задачи).
 *
 * Источник данных — `employeesRepo`; при монтировании дёргается loadAll.
 */
const FILTER_LABELS: Record<TaskFilter, string> = {
  all: 'Все',
  open: 'Открытые',
  overdue: 'Просрочены',
  'upcoming-7': '7 дней',
  'upcoming-30': '30 дней',
  'no-due': 'Без дедлайна',
  done: 'Закрытые',
};

const FILTER_TONE: Record<TaskFilter, string> = {
  all: 'bg-white/10 text-slate-100',
  open: 'bg-blue-500/25 text-blue-200',
  overdue: 'bg-red-500/25 text-red-200',
  'upcoming-7': 'bg-amber-500/25 text-amber-200',
  'upcoming-30': 'bg-amber-500/15 text-amber-200',
  'no-due': 'bg-slate-500/25 text-slate-200',
  done: 'bg-emerald-500/20 text-emerald-200',
};

export function TasksScreen(): JSX.Element {
  const loc = useLocation();
  const employees = employeesRepo.signal.value;
  const now = useMemo(() => new Date(), []);
  const [filter, setFilter] = useState<TaskFilter>('open');
  const [query, setQuery] = useState('');

  useEffect(() => {
    employeesRepo.loadAll().catch((e: unknown) => {
      toast.error(`Не удалось загрузить задачи: ${e instanceof Error ? e.message : String(e)}`);
    });
  }, []);

  const all = useMemo(() => buildGlobalTasks(employees, now), [employees, now]);
  const counts = useMemo<Record<TaskFilter, number>>(() => {
    return {
      all: applyFilter(all, 'all').length,
      open: applyFilter(all, 'open').length,
      overdue: applyFilter(all, 'overdue').length,
      'upcoming-7': applyFilter(all, 'upcoming-7').length,
      'upcoming-30': applyFilter(all, 'upcoming-30').length,
      'no-due': applyFilter(all, 'no-due').length,
      done: applyFilter(all, 'done').length,
    };
  }, [all]);

  const rows = useMemo(() => {
    let r = applyFilter(all, filter);
    const q = query.trim().toLowerCase();
    if (q) {
      r = r.filter(
        (x) => x.text.toLowerCase().includes(q) || x.empName.toLowerCase().includes(q),
      );
    }
    return sortByUrgency(r);
  }, [all, filter, query]);

  function toggleDone(row: GlobalTask): void {
    const emp = employees.find((e) => e.id === row.empId);
    if (!emp) return;
    const tasks = (emp.tasks ?? []).slice();
    const target = tasks[row.index];
    if (!target) return;
    const nextStatus = target.status === 'выполнена' ? 'в работе' : 'выполнена';
    tasks[row.index] = { ...target, status: nextStatus };
    employeesRepo.update(emp.id, { tasks });
  }

  return (
    <div class="space-y-4">
      <header class="flex flex-wrap items-center gap-3">
        <h2 class="text-2xl font-semibold">Задачи</h2>
        <span class="text-sm text-slate-400">
          {rows.length === all.length
            ? `${all.length} всего`
            : `${rows.length} из ${all.length}`}
        </span>
        <div class="ml-auto flex items-center gap-2">
          <TextInput
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Поиск по тексту или ФИО"
            class="!w-72"
          />
        </div>
      </header>

      <nav class="flex flex-wrap gap-1.5" aria-label="Фильтры задач">
        {(Object.keys(FILTER_LABELS) as TaskFilter[]).map((f) => {
          const isActive = f === filter;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              class={`rounded-full px-3 py-1 text-xs transition-colors ${
                isActive
                  ? FILTER_TONE[f]
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
              }`}
            >
              {FILTER_LABELS[f]}
              <span class="ml-1.5 tabular-nums text-slate-400/80">{counts[f]}</span>
            </button>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div class="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
          {query
            ? <>По запросу «{query}» ничего не найдено</>
            : <>В этом срезе задач нет</>}
        </div>
      ) : (
        <div class="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table class="w-full text-sm">
            <thead class="bg-white/5 text-left text-xs uppercase text-slate-400">
              <tr>
                <th class="w-10 px-3 py-3 font-medium">Готово</th>
                <th class="px-3 py-3 font-medium">Задача</th>
                <th class="px-3 py-3 font-medium">Сотрудник</th>
                <th class="px-3 py-3 font-medium">Дедлайн</th>
                <th class="px-3 py-3 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.empId}-${r.index}`}
                  class={`border-t border-white/5 hover:bg-white/5 ${
                    r.done ? 'opacity-60' : ''
                  }`}
                >
                  <td class="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={r.done}
                      onChange={() => toggleDone(r)}
                      class="h-4 w-4 cursor-pointer"
                      aria-label="Отметить выполненной"
                    />
                  </td>
                  <td class={`px-3 py-2.5 ${r.done ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                    {r.text || <span class="text-slate-500">— без текста —</span>}
                  </td>
                  <td class="px-3 py-2.5">
                    <button
                      type="button"
                      class="text-blue-300 hover:text-blue-200 hover:underline"
                      onClick={() => loc.route(employeeUrl(r.empId))}
                    >
                      {r.empName}
                    </button>
                  </td>
                  <td class="px-3 py-2.5">
                    <DueCell due={r.due} days={r.daysToDue} done={r.done} />
                  </td>
                  <td class="px-3 py-2.5 text-slate-300">{r.status || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DueCell({ due, days, done }: { due: string; days: number | null; done: boolean }): JSX.Element {
  if (!due) return <span class="text-xs text-slate-500">—</span>;
  if (done) return <span class="text-xs text-slate-400 tabular-nums">{due}</span>;
  const tone =
    days === null
      ? 'text-slate-400'
      : days < 0
        ? 'text-red-300'
        : days <= 7
          ? 'text-amber-300'
          : days <= 30
            ? 'text-slate-300'
            : 'text-slate-400';
  const hint =
    days === null
      ? ''
      : days < 0
        ? `просрочено ${Math.abs(days)} д`
        : days === 0
          ? 'сегодня'
          : `через ${days} д`;
  return (
    <span class={`text-xs tabular-nums ${tone}`}>
      {due}
      {hint && <span class="ml-2 text-[10px] text-slate-500">{hint}</span>}
    </span>
  );
}
