import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { useEffect, useMemo } from 'preact/hooks';
import { employeesRepo } from '@/infra/repos';
import { employeeUrl } from '@/app/routes';
import { busFactor, overdueDensity } from '@/domain/metrics';
import { calcRiskScore, type RiskScoreLevel } from '@/domain/risk';
import { buildNotifications, type NotifColor } from '@/domain/notifications';
import { toast } from '@/state/ui';

/**
 * Экран `/` — дашборд руководителя.
 *
 * Состоит из:
 *  1) KPI-шапки (всего / bus factor / высокий риск / просрочки)
 *  2) ленты уведомлений (red/yellow/blue)
 *  3) топ-N сотрудников по риску ухода
 *  4) распределения по командам и грейдам
 *
 * Источник данных — `employeesRepo.signal`. При монтировании дёргаем
 * `loadAll()` (он сам ждёт sync-очередь и сливает локальные + серверные).
 */
export function DashboardScreen(): JSX.Element {
  const loc = useLocation();
  const employees = employeesRepo.signal.value;

  useEffect(() => {
    employeesRepo.loadAll().catch((e: unknown) => {
      toast.error(`Не удалось обновить дашборд: ${e instanceof Error ? e.message : String(e)}`);
    });
  }, []);

  const now = useMemo(() => new Date(), []);

  // ---- KPI ----
  const total = employees.length;
  const bf = useMemo(() => busFactor(employees), [employees]);
  const overdue = useMemo(() => overdueDensity(employees, now), [employees, now]);

  // ---- Риски ----
  const risks = useMemo(
    () =>
      employees
        .map((e) => ({ e, r: calcRiskScore(e, now) }))
        .sort((a, b) => b.r.score - a.r.score),
    [employees, now],
  );
  const highRiskCount = risks.filter((x) => x.r.level === 'high').length;

  // ---- Уведомления ----
  const notifs = useMemo(() => buildNotifications(employees, now), [employees, now]);
  const notifsByColor = (c: NotifColor): number => notifs.filter((n) => n.color === c).length;

  // ---- Распределения ----
  const byTeam = useMemo(() => groupCount(employees, (e) => e.team || 'Без команды'), [employees]);
  const byGrade = useMemo(() => groupCount(employees, (e) => e.grade || '—'), [employees]);

  if (total === 0) {
    return (
      <div class="space-y-6">
        <h2 class="text-2xl font-semibold">Дашборд</h2>
        <div class="rounded-2xl border border-dashed border-white/10 bg-white/5 p-10 text-center">
          <p class="text-lg text-slate-200">База пуста</p>
          <p class="mt-1 text-sm text-slate-400">
            Добавьте сотрудников на странице CRM — здесь появятся метрики и уведомления.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-6">
      <h2 class="text-2xl font-semibold">Дашборд</h2>

      <section class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Сотрудников" value={total} hint="всего в базе" />
        <KpiCard
          label="Bus factor"
          value={bf}
          hint="сколько ключевых людей нельзя потерять"
          tone={bf <= 1 ? 'red' : bf <= 2 ? 'yellow' : 'green'}
        />
        <KpiCard
          label="Высокий риск"
          value={highRiskCount}
          hint="сотрудников в красной зоне"
          tone={highRiskCount > 0 ? 'red' : 'green'}
        />
        <KpiCard
          label="Просрочки"
          value={`${Math.round(overdue * 100)}%`}
          hint="доля сотрудников с просроченными задачами"
          tone={overdue > 0.2 ? 'red' : overdue > 0 ? 'yellow' : 'green'}
        />
      </section>

      <section class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Уведомления"
          right={
            <div class="flex gap-1 text-xs">
              <ColorChip color="red" count={notifsByColor('red')} />
              <ColorChip color="yellow" count={notifsByColor('yellow')} />
              <ColorChip color="blue" count={notifsByColor('blue')} />
            </div>
          }
        >
          {notifs.length === 0 ? (
            <p class="text-sm text-slate-500">Сейчас всё спокойно — ни одного триггера.</p>
          ) : (
            <ul class="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {notifs.slice(0, 50).map((n) => (
                <li
                  key={n.id}
                  class={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${notifColorClass(n.color)}`}
                >
                  <span class="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-current" />
                  <div class="min-w-0 flex-1">
                    <p class="leading-snug">{n.text}</p>
                    <button
                      type="button"
                      onClick={() => loc.route(employeeUrl(n.empId))}
                      class="mt-0.5 text-xs text-blue-300 hover:underline"
                    >
                      {n.employee} →
                    </button>
                  </div>
                </li>
              ))}
              {notifs.length > 50 && (
                <li class="px-3 text-xs text-slate-500">
                  …и ещё {notifs.length - 50} уведомлений
                </li>
              )}
            </ul>
          )}
        </Card>

        <Card title="Топ риска ухода">
          {risks.slice(0, 10).every((x) => x.r.score === 0) ? (
            <p class="text-sm text-slate-500">Все в зелёной зоне.</p>
          ) : (
            <ol class="space-y-2">
              {risks.slice(0, 10).map(({ e, r }) => (
                <li key={e.id} class="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                  <RiskDot level={r.level} />
                  <button
                    type="button"
                    onClick={() => loc.route(employeeUrl(e.id))}
                    class="min-w-0 flex-1 text-left"
                  >
                    <p class="truncate text-sm text-slate-100">
                      {e.fullName || '— без имени —'}
                    </p>
                    <p class="truncate text-xs text-slate-500">
                      {[e.role, e.team].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </button>
                  <span class="text-sm font-semibold tabular-nums text-slate-300">
                    {r.score}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </section>

      <section class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="По командам">
          <DistroTable rows={byTeam} total={total} />
        </Card>
        <Card title="По грейдам">
          <DistroTable rows={byGrade} total={total} order={['Junior', 'Middle', 'Senior', 'Lead']} />
        </Card>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------
// Подкомпоненты
// ---------------------------------------------------------------

type Tone = 'green' | 'yellow' | 'red' | 'neutral';

function KpiCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
}): JSX.Element {
  const toneClass: Record<Tone, string> = {
    neutral: 'text-slate-100',
    green: 'text-emerald-300',
    yellow: 'text-amber-300',
    red: 'text-red-300',
  };
  return (
    <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p class="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p class={`mt-1 text-3xl font-semibold tabular-nums ${toneClass[tone]}`}>{value}</p>
      {hint && <p class="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: preact.ComponentChildren;
  children: preact.ComponentChildren;
}): JSX.Element {
  return (
    <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
      <header class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
        {right}
      </header>
      {children}
    </div>
  );
}

function ColorChip({ color, count }: { color: NotifColor; count: number }): JSX.Element {
  const cls: Record<NotifColor, string> = {
    red: 'bg-red-500/20 text-red-300',
    yellow: 'bg-amber-500/20 text-amber-300',
    blue: 'bg-blue-500/20 text-blue-300',
  };
  return <span class={`rounded-full px-2 py-0.5 ${cls[color]}`}>{count}</span>;
}

function notifColorClass(c: NotifColor): string {
  switch (c) {
    case 'red':
      return 'border-red-500/30 bg-red-500/5 text-red-300';
    case 'yellow':
      return 'border-amber-500/30 bg-amber-500/5 text-amber-300';
    case 'blue':
      return 'border-blue-500/30 bg-blue-500/5 text-blue-300';
  }
}

function RiskDot({ level }: { level: RiskScoreLevel }): JSX.Element {
  const cls: Record<RiskScoreLevel, string> = {
    low: 'bg-emerald-400',
    medium: 'bg-amber-400',
    high: 'bg-red-400',
  };
  return <span class={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${cls[level]}`} aria-label={level} />;
}

interface DistroRow {
  key: string;
  count: number;
}

function DistroTable({
  rows,
  total,
  order,
}: {
  rows: DistroRow[];
  total: number;
  order?: string[];
}): JSX.Element {
  if (rows.length === 0) {
    return <p class="text-sm text-slate-500">Данных нет.</p>;
  }
  const sorted = order
    ? [...rows].sort((a, b) => (order.indexOf(a.key) - order.indexOf(b.key)) || a.key.localeCompare(b.key))
    : [...rows].sort((a, b) => b.count - a.count);
  return (
    <ul class="space-y-2">
      {sorted.map((r) => {
        const pct = total === 0 ? 0 : Math.round((r.count / total) * 100);
        return (
          <li key={r.key}>
            <div class="flex items-center justify-between text-sm">
              <span class="text-slate-200">{r.key}</span>
              <span class="tabular-nums text-slate-400">
                {r.count} · {pct}%
              </span>
            </div>
            <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div class="h-full bg-blue-500/60" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------

function groupCount<T>(items: T[], keyOf: (it: T) => string): DistroRow[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const k = keyOf(it);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([key, count]) => ({ key, count }));
}
