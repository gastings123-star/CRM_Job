import type { JSX } from 'preact';
import { useLocation, useRoute } from 'preact-iso';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { employeesRepo, feedbackRepo, pulseRepo, teamsRepo } from '@/infra/repos';
import { routes } from '@/app/routes';
import { Button } from '@/ui/components/Button';
import { toast } from '@/state/ui';
import {
  currentStreak,
  escalationsWindow,
  mondayOf,
  recentWeeks,
  snapshotsForTeam,
  sparklineData,
  sparklinePath,
  tailSlope,
  findSnapshot,
} from '@/domain/pulse';
import {
  feedbackForTeam,
  feedbackToJson,
  feedbackToMarkdown,
  filterBySource,
  MOOD_GLYPH,
  MOOD_LABEL,
  SOURCE_LABEL,
} from '@/domain/feedback';
import type {
  FeedbackSource,
  PulseStatus,
  TeamFeedback,
  TeamPulseSnapshot,
} from '@/data/schema';
import { PulseSnapshotModal } from './PulseSnapshotModal';
import { FeedbackModal } from './FeedbackModal';

/**
 * `/teams/:id` — карточка команды с разделом «Пульс».
 *
 * Состоит из:
 *  - шапки (название, цветной чип, кнопка «Снэпшот за неделю»);
 *  - четырёх KPI (текущий статус + streak, эскалации 4w/12w, slope tailIndex);
 *  - спарклайна tailIndex и эскалации-баров за 12 недель;
 *  - timeline снэпшотов (по убыванию) с возможностью «открыть и поправить».
 */
const STATUS_TONE: Record<PulseStatus, string> = {
  green: 'bg-emerald-500/25 text-emerald-200',
  yellow: 'bg-amber-500/25 text-amber-200',
  red: 'bg-red-500/25 text-red-200',
};
const STATUS_DOT: Record<PulseStatus, string> = {
  green: 'bg-emerald-400',
  yellow: 'bg-amber-400',
  red: 'bg-red-400',
};

const ESC_KIND_LABEL: Record<string, string> = {
  decision: 'решение',
  resource: 'ресурс',
  communication: 'коммуникация',
};

export function TeamDetailScreen(): JSX.Element {
  const { params } = useRoute();
  const loc = useLocation();
  const teamId = params.id ?? '';
  const teams = teamsRepo.signal.value;
  const employees = employeesRepo.signal.value;
  const allPulse = pulseRepo.signal.value;
  const allFeedback = feedbackRepo.signal.value;
  const now = useMemo(() => new Date(), []);
  const [editWeek, setEditWeek] = useState<string | null>(null);
  const [editFeedback, setEditFeedback] = useState<TeamFeedback | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSource, setFeedbackSource] = useState<'all' | FeedbackSource>('all');

  useEffect(() => {
    teamsRepo.loadAll().catch((e: unknown) => toast.error(toMsg(e)));
    pulseRepo.loadAll().catch((e: unknown) => toast.error(toMsg(e)));
    feedbackRepo.loadAll().catch(() => undefined);
    employeesRepo.loadAll().catch(() => undefined);
  }, []);

  const team = useMemo(() => teams.find((t) => t.id === teamId) ?? null, [teams, teamId]);

  const sorted = useMemo(
    () => snapshotsForTeam(allPulse, teamId),
    [allPulse, teamId],
  );
  const streak = useMemo(() => currentStreak(sorted), [sorted]);
  const esc4w = useMemo(() => escalationsWindow(sorted, now, 4), [sorted, now]);
  const esc12w = useMemo(() => escalationsWindow(sorted, now, 12), [sorted, now]);
  const slope = useMemo(() => tailSlope(sorted, now), [sorted, now]);
  const spark = useMemo(() => sparklineData(sorted, now, 12), [sorted, now]);

  const currentMonday = useMemo(() => mondayOf(now), [now]);
  const currentSnapshot = useMemo(
    () => findSnapshot(sorted, teamId, currentMonday),
    [sorted, teamId, currentMonday],
  );

  // Кол-во сотрудников у команды (по строковому Employee.team === team.name).
  const empCount = useMemo(
    () => (team ? employees.filter((e) => e.team === team.name).length : 0),
    [team, employees],
  );

  if (!team) {
    return (
      <div class="space-y-4">
        <Button variant="secondary" onClick={() => loc.route(routes.teams.path)}>
          ← К командам
        </Button>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
          Команда не найдена. Возможно, удалена.
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-6">
      <header class="flex items-center gap-4">
        <Button variant="secondary" size="sm" onClick={() => loc.route(routes.teams.path)}>
          ← К командам
        </Button>
        <span class="h-4 w-4 rounded" style={{ backgroundColor: team.color }} aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-2xl font-semibold leading-tight">{team.name}</h2>
          <p class="text-sm text-slate-400">
            {empCount} сотрудник{plural(empCount, ['', 'а', 'ов'])}
          </p>
        </div>
        <Button onClick={() => setEditWeek(currentMonday)}>
          {currentSnapshot ? 'Обновить снэпшот за неделю' : '+ Снэпшот за неделю'}
        </Button>
      </header>

      <section class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Статус">
          {streak.status ? (
            <div class="flex items-baseline gap-2">
              <span class={`rounded-full px-2 py-0.5 text-sm ${STATUS_TONE[streak.status]}`}>
                {labelOf(streak.status)}
              </span>
              <span class="text-sm text-slate-400">{streak.weeks}w</span>
            </div>
          ) : (
            <p class="text-sm text-slate-500">Нет данных</p>
          )}
        </KpiCard>
        <KpiCard label="Эскалации 4w" tone={esc4w >= 3 ? 'red' : esc4w > 0 ? 'amber' : 'neutral'}>
          <p class="text-2xl font-semibold tabular-nums">{esc4w}</p>
        </KpiCard>
        <KpiCard label="Эскалации 12w">
          <p class="text-2xl font-semibold tabular-nums text-slate-200">{esc12w}</p>
        </KpiCard>
        <KpiCard label="Тренд хвостов">
          <TrendArrow slope={slope} />
        </KpiCard>
      </section>

      <section class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <header class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Спарклайн tailIndex · 12 недель
          </h3>
          <span class="text-xs text-slate-500">
            slope {slope > 0 ? '+' : ''}
            {slope.toFixed(2)} / нед
          </span>
        </header>
        <Sparkline points={spark} />
        <EscalationsBars points={spark.map((p) => ({
          weekStart: p.weekStart,
          escalations: allPulse.find((s) => s.teamId === teamId && s.weekStart === p.weekStart)?.escalations ?? 0,
        }))} />
      </section>

      <section class="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
          История снэпшотов
        </h3>
        {sorted.length === 0 ? (
          <p class="text-sm text-slate-500">
            Снэпшотов ещё нет. Нажмите «+ Снэпшот за неделю» — заполнится текущая неделя.
          </p>
        ) : (
          <ul class="space-y-2">
            {[...sorted]
              .reverse()
              .slice(0, 24)
              .map((s) => (
                <SnapshotRow key={s.id} snap={s} onEdit={() => setEditWeek(s.weekStart)} />
              ))}
          </ul>
        )}
      </section>

      <FeedbackSection
        team={team}
        all={allFeedback}
        source={feedbackSource}
        onSourceChange={setFeedbackSource}
        onAdd={() => {
          setEditFeedback(null);
          setFeedbackOpen(true);
        }}
        onOpen={(f) => {
          setEditFeedback(f);
          setFeedbackOpen(true);
        }}
      />

      <PulseSnapshotModal
        open={editWeek !== null}
        weekStart={editWeek ?? currentMonday}
        teamId={teamId}
        teamName={team.name}
        existing={editWeek ? findSnapshot(sorted, teamId, editWeek) : undefined}
        previous={
          editWeek
            ? findPreviousSnapshot(sorted, teamId, editWeek)
            : findPreviousSnapshot(sorted, teamId, currentMonday)
        }
        onClose={() => setEditWeek(null)}
      />

      <FeedbackModal
        open={feedbackOpen}
        teamId={teamId}
        teamName={team.name}
        existing={editFeedback ?? undefined}
        onClose={() => {
          setFeedbackOpen(false);
          setEditFeedback(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------
// Секция «Обратная связь» — фильтр по источнику, список, экспорт
// ---------------------------------------------------------------

function FeedbackSection({
  team,
  all,
  source,
  onSourceChange,
  onAdd,
  onOpen,
}: {
  team: { id: string; name: string; color: string };
  all: TeamFeedback[];
  source: 'all' | FeedbackSource;
  onSourceChange: (v: 'all' | FeedbackSource) => void;
  onAdd: () => void;
  onOpen: (f: TeamFeedback) => void;
}): JSX.Element {
  const list = feedbackForTeam(all, team.id);
  const filtered = filterBySource(list, source);

  function exportMarkdown(): void {
    const md = feedbackToMarkdown(team, list);
    downloadText(md, `feedback-${team.name}-${todayIso()}.md`, 'text/markdown');
    toast.info(`Экспортирован Markdown · ${list.length} записей`);
  }
  function exportJson(): void {
    const json = feedbackToJson(team, list);
    downloadText(json, `feedback-${team.name}-${todayIso()}.json`, 'application/json');
    toast.info(`Экспортирован JSON · ${list.length} записей`);
  }

  return (
    <section class="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
      <header class="flex flex-wrap items-center gap-3">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Обратная связь
        </h3>
        <span class="text-xs text-slate-500">{list.length} записей</span>
        <div class="ml-auto flex flex-wrap items-center gap-2">
          <SourceFilter value={source} onChange={onSourceChange} list={list} />
          <Button variant="secondary" size="sm" onClick={exportMarkdown} disabled={list.length === 0}>
            .md
          </Button>
          <Button variant="secondary" size="sm" onClick={exportJson} disabled={list.length === 0}>
            .json
          </Button>
          <Button size="sm" onClick={onAdd}>
            + Запись
          </Button>
        </div>
      </header>

      {filtered.length === 0 ? (
        <p class="text-sm text-slate-500">
          {list.length === 0
            ? 'Записей пока нет. Нажмите «+ Запись» после очередного синхрона с DPO.'
            : 'В этом фильтре пусто.'}
        </p>
      ) : (
        <ul class="space-y-2">
          {filtered.map((f) => (
            <FeedbackRow key={f.id} item={f} onOpen={() => onOpen(f)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SourceFilter({
  value,
  onChange,
  list,
}: {
  value: 'all' | FeedbackSource;
  onChange: (v: 'all' | FeedbackSource) => void;
  list: TeamFeedback[];
}): JSX.Element {
  const counts = {
    all: list.length,
    dpo: list.filter((f) => f.source === 'dpo').length,
    lead: list.filter((f) => f.source === 'lead').length,
    peer: list.filter((f) => f.source === 'peer').length,
    self: list.filter((f) => f.source === 'self').length,
  };
  const items: { id: 'all' | FeedbackSource; label: string }[] = [
    { id: 'all', label: 'Все' },
    { id: 'dpo', label: SOURCE_LABEL.dpo },
    { id: 'lead', label: SOURCE_LABEL.lead },
    { id: 'peer', label: SOURCE_LABEL.peer },
    { id: 'self', label: SOURCE_LABEL.self },
  ];
  return (
    <div class="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1 text-xs">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onChange(it.id)}
          class={`rounded px-2 py-1 transition-colors ${
            value === it.id ? 'bg-white/10 text-slate-100' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {it.label} <span class="ml-1 tabular-nums text-slate-500">{counts[it.id]}</span>
        </button>
      ))}
    </div>
  );
}

function FeedbackRow({
  item,
  onOpen,
}: {
  item: TeamFeedback;
  onOpen: () => void;
}): JSX.Element {
  const openItems = item.actionItems.filter((a) => !a.done).length;
  return (
    <li class="rounded-lg bg-white/5 px-3 py-2.5">
      <header class="flex flex-wrap items-baseline gap-2 text-sm">
        <span class="tabular-nums text-slate-300">{item.date}</span>
        <span class="rounded bg-white/5 px-1.5 py-0.5 text-xs uppercase text-slate-300">
          {SOURCE_LABEL[item.source]}
        </span>
        {item.author && <span class="text-xs text-slate-400">{item.author}</span>}
        <span class="text-xs">
          {MOOD_GLYPH[item.mood]} {MOOD_LABEL[item.mood]}
        </span>
        {item.themes.length > 0 && (
          <span class="text-xs text-slate-500">· {item.themes.join(', ')}</span>
        )}
        <Button variant="ghost" size="sm" onClick={onOpen} class="ml-auto">
          Открыть
        </Button>
      </header>
      {item.note && (
        <p class="mt-1 line-clamp-2 text-sm text-slate-300">{item.note}</p>
      )}
      {item.actionItems.length > 0 && (
        <p class="mt-1 text-xs text-slate-500">
          Action items: {item.actionItems.length} · открытых {openItems}
        </p>
      )}
    </li>
  );
}

function downloadText(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------
// Подкомпоненты
// ---------------------------------------------------------------

type Tone = 'neutral' | 'red' | 'amber' | 'emerald';

function KpiCard({
  label,
  tone = 'neutral',
  children,
}: {
  label: string;
  tone?: Tone;
  children: preact.ComponentChildren;
}): JSX.Element {
  const ring: Record<Tone, string> = {
    neutral: 'border-white/10',
    red: 'border-red-500/30',
    amber: 'border-amber-500/30',
    emerald: 'border-emerald-500/30',
  };
  return (
    <div class={`rounded-2xl border bg-white/5 p-4 ${ring[tone]}`}>
      <p class="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <div class="mt-1">{children}</div>
    </div>
  );
}

function TrendArrow({ slope }: { slope: number }): JSX.Element {
  // Порог: |slope| < 0.05 считаем плоским
  const dir = slope > 0.05 ? 'up' : slope < -0.05 ? 'down' : 'flat';
  const map = {
    up: { glyph: '↗', tone: 'text-red-300', label: 'хвосты растут' },
    down: { glyph: '↘', tone: 'text-emerald-300', label: 'хвосты снижаются' },
    flat: { glyph: '→', tone: 'text-slate-300', label: 'стабильно' },
  } as const;
  const m = map[dir];
  return (
    <div class="flex items-baseline gap-2">
      <span class={`text-2xl ${m.tone}`}>{m.glyph}</span>
      <span class="text-xs text-slate-400">{m.label}</span>
    </div>
  );
}

function Sparkline({
  points,
}: {
  points: { weekStart: string; value: number | null; status: PulseStatus | null }[];
}): JSX.Element {
  const W = 480;
  const H = 56;
  const path = sparklinePath(points, W, H);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="block w-full" aria-label="Спарклайн tailIndex">
      {/* Сетка */}
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      {/* Линия */}
      {path && <path d={path} fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />}
      {/* Точки с цветом по статусу */}
      {points.map((p, i) => {
        if (p.value === null) return null;
        const stepX = points.length > 1 ? W / (points.length - 1) : 0;
        const x = i * stepX;
        const y = H - (p.value / 10) * H;
        const fill =
          p.status === 'green' ? '#34d399' : p.status === 'yellow' ? '#fbbf24' : p.status === 'red' ? '#f87171' : '#94a3b8';
        return <circle key={i} cx={x} cy={y} r="3" fill={fill} />;
      })}
    </svg>
  );
}

function EscalationsBars({
  points,
}: {
  points: { weekStart: string; escalations: number }[];
}): JSX.Element {
  if (points.every((p) => p.escalations === 0)) return null as unknown as JSX.Element;
  const max = Math.max(1, ...points.map((p) => p.escalations));
  return (
    <div class="mt-3">
      <p class="mb-1 text-xs uppercase tracking-wide text-slate-500">Эскалации по неделям</p>
      <div class="flex h-8 items-end gap-1">
        {points.map((p, i) => (
          <div
            key={i}
            class="min-w-[6px] flex-1 rounded-t bg-amber-500/70"
            style={{ height: `${(p.escalations / max) * 100}%` }}
            title={`${p.weekStart} · ${p.escalations} эскалаций`}
          />
        ))}
      </div>
    </div>
  );
}

function SnapshotRow({
  snap,
  onEdit,
}: {
  snap: TeamPulseSnapshot;
  onEdit: () => void;
}): JSX.Element {
  return (
    <li class="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm">
      <span class={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_DOT[snap.status]}`} />
      <span class="tabular-nums text-slate-300">{snap.weekStart}</span>
      <span class="text-slate-400">хвосты: {snap.tailIndex}/10</span>
      {snap.escalations > 0 && (
        <span class="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
          {snap.escalations} эск.
          {snap.escalationKind && ` · ${ESC_KIND_LABEL[snap.escalationKind]}`}
        </span>
      )}
      {snap.note && <span class="ml-1 truncate text-slate-400">{snap.note}</span>}
      <Button variant="ghost" size="sm" onClick={onEdit} class="ml-auto">
        Открыть
      </Button>
    </li>
  );
}

// ---------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------

function labelOf(s: PulseStatus): string {
  return s === 'green' ? '🟢 зелёный' : s === 'yellow' ? '🟡 жёлтый' : '🔴 красный';
}

function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

function toMsg(e: unknown): string {
  return `Ошибка загрузки: ${e instanceof Error ? e.message : String(e)}`;
}

function findPreviousSnapshot(
  sorted: TeamPulseSnapshot[],
  teamId: string,
  beforeWeekStart: string,
): TeamPulseSnapshot | undefined {
  // sorted уже по weekStart ASC → последний элемент < beforeWeekStart.
  let prev: TeamPulseSnapshot | undefined;
  for (const s of sorted) {
    if (s.teamId !== teamId) continue;
    if (s.weekStart >= beforeWeekStart) break;
    prev = s;
  }
  return prev;
}

// для отладки: чтобы линтер не ругался на неиспользуемый recentWeeks (мог
// пригодиться в EscalationsBars, но мы используем уже агрегированный spark).
void recentWeeks;
