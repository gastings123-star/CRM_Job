import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { useEffect, useMemo } from 'preact/hooks';
import { employeesRepo } from '@/infra/repos';
import { employeeUrl } from '@/app/routes';
import {
  byPromotionReadiness,
  lowRated,
  overdueIpr,
  topSkills,
  upcomingIpr,
  type DevelopmentRow,
  type SkillStat,
} from '@/domain/development';
import { toast } from '@/state/ui';
import type { Employee, PromotionReadiness } from '@/data/schema';

/**
 * Экран `/development` — сводка по росту сотрудников:
 *  - просроченные и скоро-дедлайн ИПР;
 *  - распределение готовности к повышению;
 *  - низкие оценки руководителя;
 *  - топ-навыков по числу обладателей и экспертов.
 *
 * Любая строка → переход в карточку сотрудника (соответствующая вкладка
 * откроется руками; routing на конкретную табу пока не реализован).
 */
export function DevelopmentScreen(): JSX.Element {
  const loc = useLocation();
  const employees = employeesRepo.signal.value;
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    employeesRepo.loadAll().catch((e: unknown) => {
      toast.error(`Не удалось загрузить данные: ${e instanceof Error ? e.message : String(e)}`);
    });
  }, []);

  const overdue = useMemo(() => overdueIpr(employees, now), [employees, now]);
  const upcoming = useMemo(() => upcomingIpr(employees, now, 30), [employees, now]);
  const promotion = useMemo(() => byPromotionReadiness(employees), [employees]);
  const low = useMemo(() => lowRated(employees, 3), [employees]);
  const skills = useMemo(() => topSkills(employees, 20), [employees]);

  const go = (id: string): void => loc.route(employeeUrl(id));

  if (employees.length === 0) {
    return (
      <div class="space-y-6">
        <h2 class="text-2xl font-semibold">Развитие</h2>
        <div class="rounded-2xl border border-dashed border-white/10 bg-white/5 p-10 text-center text-slate-400">
          Сначала добавьте сотрудников и заполните их ИПР/навыки — здесь появится сводка.
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-6">
      <h2 class="text-2xl font-semibold">Развитие</h2>

      <section class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Просроченные ИПР" tone="red">
          {overdue.length === 0 ? (
            <p class="text-sm text-slate-500">Просрочек нет.</p>
          ) : (
            <IprList rows={overdue} onOpen={go} dayLabel={(d) => `просрочено ${Math.abs(d)} д`} />
          )}
        </Card>
        <Card title="Скоро дедлайн (30 дней)" tone="yellow">
          {upcoming.length === 0 ? (
            <p class="text-sm text-slate-500">Ничего срочного.</p>
          ) : (
            <IprList rows={upcoming} onOpen={go} dayLabel={(d) => `через ${d} д`} />
          )}
        </Card>
      </section>

      <section class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Готовность к повышению">
          <PromotionBlock data={promotion} onOpen={go} />
        </Card>
        <Card title="Низкая оценка руководителя (<3)" tone={low.length > 0 ? 'red' : 'neutral'}>
          {low.length === 0 ? (
            <p class="text-sm text-slate-500">Никто не в зоне риска по оценке.</p>
          ) : (
            <ul class="space-y-2">
              {low.map((e) => (
                <li key={e.id} class="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                  <span class="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-300 tabular-nums">
                    {e.managerRating?.score ?? '?'}
                  </span>
                  <button
                    type="button"
                    onClick={() => go(e.id)}
                    class="min-w-0 flex-1 text-left"
                  >
                    <p class="truncate text-sm">{e.fullName || '— без имени —'}</p>
                    <p class="truncate text-xs text-slate-500">
                      {[e.role, e.team].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <Card title="Топ навыков">
        {skills.length === 0 ? (
          <p class="text-sm text-slate-500">
            Навыков ещё не указано. Откройте карточку сотрудника → вкладка «Навыки».
          </p>
        ) : (
          <SkillTable skills={skills} />
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------
// Подкомпоненты
// ---------------------------------------------------------------

type Tone = 'red' | 'yellow' | 'neutral';

function Card({
  title,
  tone = 'neutral',
  children,
}: {
  title: string;
  tone?: Tone;
  children: preact.ComponentChildren;
}): JSX.Element {
  const ring: Record<Tone, string> = {
    neutral: 'border-white/10',
    yellow: 'border-amber-500/30',
    red: 'border-red-500/30',
  };
  return (
    <div class={`rounded-2xl border bg-white/5 p-5 ${ring[tone]}`}>
      <h3 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

function IprList({
  rows,
  onOpen,
  dayLabel,
}: {
  rows: DevelopmentRow[];
  onOpen: (empId: string) => void;
  dayLabel: (days: number) => string;
}): JSX.Element {
  return (
    <ul class="max-h-[20rem] space-y-2 overflow-y-auto pr-1">
      {rows.map((r, i) => (
        <li key={`${r.empId}-${i}`} class="rounded-lg bg-white/5 px-3 py-2">
          <div class="flex items-baseline justify-between gap-3">
            <button
              type="button"
              onClick={() => onOpen(r.empId)}
              class="truncate text-left text-sm text-blue-300 hover:underline"
            >
              {r.empName}
            </button>
            {r.daysToDeadline !== null && (
              <span class="shrink-0 text-xs text-slate-400 tabular-nums">
                {dayLabel(r.daysToDeadline)}
              </span>
            )}
          </div>
          <p class="text-xs text-slate-300">
            {r.zone || '— без зоны —'}{' '}
            {r.deadline && <span class="text-slate-500">· {r.deadline}</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}

function PromotionBlock({
  data,
  onOpen,
}: {
  data: Record<PromotionReadiness, Employee[]>;
  onOpen: (empId: string) => void;
}): JSX.Element {
  const order: PromotionReadiness[] = [
    'готов сейчас',
    'готов через 6 мес',
    'готов через год',
    'не готов',
  ];
  const tone: Record<PromotionReadiness, string> = {
    'готов сейчас': 'bg-emerald-500/20 text-emerald-300',
    'готов через 6 мес': 'bg-blue-500/20 text-blue-300',
    'готов через год': 'bg-amber-500/20 text-amber-300',
    'не готов': 'bg-slate-500/20 text-slate-300',
  };
  return (
    <div class="space-y-3">
      {order.map((k) => {
        const list = data[k];
        return (
          <div key={k}>
            <div class="mb-1 flex items-center justify-between">
              <span class={`rounded-full px-2 py-0.5 text-xs ${tone[k]}`}>{k}</span>
              <span class="text-xs text-slate-500 tabular-nums">{list.length}</span>
            </div>
            {list.length === 0 ? (
              <p class="text-xs text-slate-500">—</p>
            ) : (
              <ul class="flex flex-wrap gap-1.5">
                {list.slice(0, 12).map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(e.id)}
                      class="rounded bg-white/5 px-2 py-0.5 text-xs hover:bg-white/10"
                    >
                      {e.fullName || '—'}
                    </button>
                  </li>
                ))}
                {list.length > 12 && (
                  <li class="text-xs text-slate-500">…ещё {list.length - 12}</li>
                )}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SkillTable({ skills }: { skills: SkillStat[] }): JSX.Element {
  return (
    <div class="overflow-hidden rounded-xl border border-white/10">
      <table class="w-full text-sm">
        <thead class="bg-white/5 text-left text-xs uppercase text-slate-400">
          <tr>
            <th class="px-3 py-2 font-medium">Навык</th>
            <th class="px-3 py-2 font-medium">Обладателей</th>
            <th class="px-3 py-2 font-medium">Экспертов (≥4)</th>
            <th class="px-3 py-2 font-medium">Средний уровень</th>
          </tr>
        </thead>
        <tbody>
          {skills.map((s) => (
            <tr key={s.name} class="border-t border-white/5">
              <td class="px-3 py-2 text-slate-100">{s.name}</td>
              <td class="px-3 py-2 text-slate-300 tabular-nums">{s.total}</td>
              <td class="px-3 py-2 text-slate-300 tabular-nums">{s.experts}</td>
              <td class="px-3 py-2 text-slate-300 tabular-nums">{s.avgLevel.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
