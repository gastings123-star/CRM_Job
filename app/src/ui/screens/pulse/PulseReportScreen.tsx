import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { pulseRepo, teamsRepo } from '@/infra/repos';
import { teamUrl } from '@/app/routes';
import { toast } from '@/state/ui';
import {
  currentStreak,
  escalationsWindow,
  recentWeeks,
  snapshotsForTeam,
  tailSlope,
} from '@/domain/pulse';
import type { PulseStatus, Team, TeamPulseSnapshot } from '@/data/schema';

/**
 * Экран `/pulse` — сводный heatmap «команды × недели» для квартального обзора.
 *
 * Состав:
 *  - управление окном (12 / 24 / 52 недель) и сортировкой команд;
 *  - заголовок-шкала с подписями дат;
 *  - таблица: ряд = команда (имя + текущий streak), колонки = недели,
 *    каждая ячейка цветная по статусу либо «нет данных»;
 *  - hover-tooltip с заметкой, эскалациями и tailIndex;
 *  - клик по имени или по ячейке → /teams/:id;
 *  - сводный счётчик «горит / стабильно / нет данных».
 */
const STATUS_BG: Record<PulseStatus, string> = {
  green: 'bg-emerald-500/70',
  yellow: 'bg-amber-500/70',
  red: 'bg-red-500/70',
};

const STATUS_DOT: Record<PulseStatus, string> = {
  green: 'bg-emerald-400',
  yellow: 'bg-amber-400',
  red: 'bg-red-400',
};

const STATUS_LABEL: Record<PulseStatus, string> = {
  green: 'зелёный',
  yellow: 'жёлтый',
  red: 'красный',
};

const ESC_KIND_LABEL: Record<string, string> = {
  decision: 'решение',
  resource: 'ресурс',
  communication: 'коммуникация',
};

type WindowSize = 12 | 24 | 52;
type SortMode = 'name' | 'risk' | 'fill';

export function PulseReportScreen(): JSX.Element {
  const loc = useLocation();
  const teams = teamsRepo.signal.value;
  const allPulse = pulseRepo.signal.value;
  const now = useMemo(() => new Date(), []);
  const [windowSize, setWindowSize] = useState<WindowSize>(12);
  const [sortMode, setSortMode] = useState<SortMode>('risk');

  useEffect(() => {
    teamsRepo.loadAll().catch((e: unknown) => toast.error(toMsg(e)));
    pulseRepo.loadAll().catch(() => undefined);
  }, []);

  const weeks = useMemo(() => recentWeeks(now, windowSize), [now, windowSize]);

  // Подготовим ряды: для каждой команды — массив снэпшотов по неделям
  // (в порядке `weeks`) и агрегаты для сортировки.
  const rows = useMemo(() => {
    return teams.map((team) => {
      const sorted = snapshotsForTeam(allPulse, team.id);
      const byWeek = new Map(sorted.map((s) => [s.weekStart, s]));
      const cells = weeks.map((w) => byWeek.get(w) ?? null);
      const streak = currentStreak(sorted);
      const filled = cells.filter(Boolean).length;
      const reds = cells.filter((c) => c?.status === 'red').length;
      const yellows = cells.filter((c) => c?.status === 'yellow').length;
      const esc = escalationsWindow(sorted, now, windowSize);
      const slope = tailSlope(sorted, now, windowSize);
      // «Heat» score для сортировки по риску:
      // 3 за каждый red, 1 за yellow, + кол-во эскалаций.
      const heat = reds * 3 + yellows + esc;
      return { team, cells, streak, filled, reds, yellows, esc, slope, heat };
    });
  }, [teams, allPulse, weeks, windowSize, now]);

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    if (sortMode === 'risk') arr.sort((a, b) => b.heat - a.heat || a.team.name.localeCompare(b.team.name));
    else if (sortMode === 'fill') arr.sort((a, b) => b.filled - a.filled || a.team.name.localeCompare(b.team.name));
    else arr.sort((a, b) => a.team.name.localeCompare(b.team.name));
    return arr;
  }, [rows, sortMode]);

  // Шкала-разделители по месяцам — рисуем подпись только когда месяц меняется.
  const weekLabels = useMemo(() => weeks.map((w) => labelOfWeek(w)), [weeks]);

  const totals = useMemo(() => {
    let red = 0;
    let yellow = 0;
    let green = 0;
    let empty = 0;
    for (const r of rows) {
      for (const c of r.cells) {
        if (!c) empty += 1;
        else if (c.status === 'red') red += 1;
        else if (c.status === 'yellow') yellow += 1;
        else green += 1;
      }
    }
    return { red, yellow, green, empty };
  }, [rows]);

  if (teams.length === 0) {
    return (
      <div class="space-y-6">
        <h2 class="text-2xl font-semibold">Пульс команд</h2>
        <div class="rounded-2xl border border-dashed border-white/10 bg-white/5 p-10 text-center text-slate-400">
          Сначала создайте команды в разделе «Команды», потом ставьте им еженедельные снэпшоты.
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-4">
      <header class="flex flex-wrap items-center gap-3">
        <h2 class="text-2xl font-semibold">Пульс команд</h2>
        <span class="text-sm text-slate-400">{teams.length} команд · {windowSize} недель</span>
        <div class="ml-auto flex flex-wrap items-center gap-2">
          <WindowSwitch value={windowSize} onChange={setWindowSize} />
          <SortSwitch value={sortMode} onChange={setSortMode} />
        </div>
      </header>

      <section class="flex flex-wrap items-center gap-2 text-xs">
        <Legend color="emerald" label={`зелёных ${totals.green}`} />
        <Legend color="amber" label={`жёлтых ${totals.yellow}`} />
        <Legend color="red" label={`красных ${totals.red}`} />
        <Legend color="slate" label={`нет данных ${totals.empty}`} />
      </section>

      <div class="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
        <table class="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th class="sticky left-0 z-10 bg-slate-950/80 px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-400">
                Команда
              </th>
              {weekLabels.map((wl, i) => (
                <th
                  key={weeks[i]}
                  class={`px-1 py-2 text-center text-[10px] tabular-nums text-slate-500 ${
                    wl.isMonthStart ? 'border-l border-white/10' : ''
                  }`}
                  title={weeks[i]}
                >
                  {wl.day}
                  {wl.month && (
                    <div class="text-[9px] uppercase text-slate-400">{wl.month}</div>
                  )}
                </th>
              ))}
              <th class="px-2 py-2 text-right text-xs uppercase tracking-wide text-slate-400">
                Тренд
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(({ team, cells, streak, slope }) => (
              <tr key={team.id} class="hover:bg-white/5">
                <td class="sticky left-0 z-10 bg-slate-950/80 px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => loc.route(teamUrl(team.id))}
                    class="flex items-center gap-2 text-left text-slate-100 hover:text-blue-200"
                  >
                    <span
                      class="h-3 w-3 shrink-0 rounded"
                      style={{ backgroundColor: team.color }}
                      aria-hidden="true"
                    />
                    <span class="min-w-0 max-w-[14rem] truncate text-sm">{team.name}</span>
                    {streak.status && (
                      <span
                        class={`ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                          streak.status === 'red'
                            ? 'bg-red-500/20 text-red-300'
                            : streak.status === 'yellow'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        <span class={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[streak.status]}`} />
                        {streak.weeks}w
                      </span>
                    )}
                  </button>
                </td>
                {cells.map((c, i) => (
                  <td
                    key={`${team.id}-${weeks[i]}`}
                    class={`p-0 ${weekLabels[i]?.isMonthStart ? 'border-l border-white/10' : ''}`}
                  >
                    <Cell snap={c} onOpen={() => loc.route(teamUrl(team.id))} weekStart={weeks[i] ?? ''} />
                  </td>
                ))}
                <td class="px-2 py-1.5 text-right">
                  <TrendBadge slope={slope} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Ячейка heatmap
// ---------------------------------------------------------------

function Cell({
  snap,
  onOpen,
  weekStart,
}: {
  snap: TeamPulseSnapshot | null;
  onOpen: () => void;
  weekStart: string;
}): JSX.Element {
  if (!snap) {
    return (
      <button
        type="button"
        onClick={onOpen}
        title={`${weekStart} · данных нет`}
        class="block h-7 w-7 bg-slate-800/40 transition-colors hover:bg-slate-700/60"
        aria-label={`${weekStart} нет данных`}
      />
    );
  }
  const tooltip = [
    `${weekStart} · ${STATUS_LABEL[snap.status]}`,
    `хвосты ${snap.tailIndex}/10`,
    snap.escalations > 0
      ? `эскалаций ${snap.escalations}${
          snap.escalationKind ? ` · ${ESC_KIND_LABEL[snap.escalationKind]}` : ''
        }`
      : null,
    snap.note ? `«${snap.note}»` : null,
  ]
    .filter(Boolean)
    .join('\n');
  // Прозрачность опционально как индикатор tailIndex (0..10 → 50%..100%).
  const op = 0.5 + (snap.tailIndex / 10) * 0.5;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={tooltip}
      class={`relative block h-7 w-7 transition-transform hover:z-10 hover:scale-110 ${STATUS_BG[snap.status]}`}
      style={{ opacity: op }}
      aria-label={tooltip}
    >
      {snap.escalations > 0 && (
        <span class="absolute right-0.5 top-0.5 inline-block h-1.5 w-1.5 rounded-full bg-white/90" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------
// Переключатели и легенда
// ---------------------------------------------------------------

function WindowSwitch({
  value,
  onChange,
}: {
  value: WindowSize;
  onChange: (v: WindowSize) => void;
}): JSX.Element {
  const opts: WindowSize[] = [12, 24, 52];
  return (
    <div class="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1 text-xs">
      {opts.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          class={`rounded px-2 py-1 transition-colors ${
            value === o ? 'bg-white/10 text-slate-100' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {o}w
        </button>
      ))}
    </div>
  );
}

function SortSwitch({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (v: SortMode) => void;
}): JSX.Element {
  const opts: { id: SortMode; label: string }[] = [
    { id: 'risk', label: 'По риску' },
    { id: 'fill', label: 'По заполнению' },
    { id: 'name', label: 'По имени' },
  ];
  return (
    <div class="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1 text-xs">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          class={`rounded px-2 py-1 transition-colors ${
            value === o.id ? 'bg-white/10 text-slate-100' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Legend({
  color,
  label,
}: {
  color: 'emerald' | 'amber' | 'red' | 'slate';
  label: string;
}): JSX.Element {
  const cls: Record<typeof color, string> = {
    emerald: 'bg-emerald-500/70',
    amber: 'bg-amber-500/70',
    red: 'bg-red-500/70',
    slate: 'bg-slate-800/40',
  };
  return (
    <span class="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5 text-slate-300">
      <span class={`inline-block h-2.5 w-2.5 rounded ${cls[color]}`} />
      {label}
    </span>
  );
}

function TrendBadge({ slope }: { slope: number }): JSX.Element {
  const dir = slope > 0.05 ? 'up' : slope < -0.05 ? 'down' : 'flat';
  const map = {
    up: { glyph: '↗', tone: 'text-red-300' },
    down: { glyph: '↘', tone: 'text-emerald-300' },
    flat: { glyph: '→', tone: 'text-slate-300' },
  } as const;
  const m = map[dir];
  return <span class={`text-lg ${m.tone}`} title={`slope ${slope.toFixed(2)} / неделю`}>{m.glyph}</span>;
}

// ---------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function labelOfWeek(iso: string): { day: number; month: string | null; isMonthStart: boolean } {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return { day: 0, month: null, isMonthStart: false };
  // Месяц подписываем, только если внутри недели начинается новый месяц
  // (Пн или последующие дни этой недели лежат в первой неделе месяца).
  // Простое правило: день <= 7 → начало месяца, подписываем.
  const isMonthStart = d <= 7;
  return { day: d, month: isMonthStart ? MONTHS_SHORT[m - 1]! : null, isMonthStart };
}

function toMsg(e: unknown): string {
  return `Ошибка загрузки: ${e instanceof Error ? e.message : String(e)}`;
}

// Тип для линтера: Team нужен только для пропов
void (null as unknown as Team);
