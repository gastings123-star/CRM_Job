import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { EmployeeSchema, type Employee } from '@/data/schema';
import { employeesRepo, teamsRepo } from '@/infra/repos';
import { employeeUrl } from '@/app/routes';
import { Button } from '@/ui/components/Button';
import { Modal } from '@/ui/components/Modal';
import { Field, Select, TextInput } from '@/ui/components/Field';
import { confirm, toast } from '@/state/ui';
import { crmViewSignal } from '@/state/crm-view';
import {
  countMatching,
  daysSinceLastOneOnOne,
  SMART_LISTS,
  type SmartList,
  type SmartListId,
} from '@/domain/crm-lists';
import { calcRiskScore } from '@/domain/risk';
import { EmployeeForm, type EmployeeFormValues } from './EmployeeForm';

/**
 * Экран `/crm` — список сотрудников + CRUD через модалки.
 *
 * Состав:
 *  - smart lists сверху (быстрые срезы: «Под риском», «ФОТ просрочен», …)
 *  - поиск-строка по имени/роли/email
 *  - сортируемые колонки таблицы
 *  - расширенная строка: команда, риск-чип, % загрузки, готовность, дни с 1-on-1
 *
 * При изменении видимого списка обновляем `crmViewSignal` —
 * EmployeeDetailScreen использует его для prev/next-навигации.
 */
type SortKey = 'fullName' | 'role' | 'grade' | 'hireDate' | 'team' | 'risk' | 'load' | 'oneonone';
type SortDir = 'asc' | 'desc';
interface SortState {
  key: SortKey;
  dir: SortDir;
}

const GRADE_ORDER: Record<string, number> = { Junior: 1, Middle: 2, Senior: 3, Lead: 4 };
const PROMO_ORDER: Record<string, number> = {
  'не готов': 0,
  'готов через год': 1,
  'готов через 6 мес': 2,
  'готов сейчас': 3,
};

export function CrmScreen(): JSX.Element {
  const loc = useLocation();
  const employees = employeesRepo.signal.value;
  const now = useMemo(() => new Date(), []);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<SortState | null>({ key: 'fullName', dir: 'asc' });
  const [activeList, setActiveList] = useState<SmartListId>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<null | 'team' | 'grade' | 'promotion'>(null);

  function toggleSort(key: SortKey): void {
    setSort((s) => {
      if (s?.key !== key) return { key, dir: 'asc' };
      if (s.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    employeesRepo
      .loadAll()
      .catch((e: unknown) => {
        if (cancelled) return;
        toast.error(
          `Не удалось загрузить сотрудников: ${e instanceof Error ? e.message : String(e)}`,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const list = SMART_LISTS.find((l) => l.id === activeList) ?? SMART_LISTS[0]!;
    const byList = employees.filter((e) => list.predicate(e, now));
    const q = query.trim().toLowerCase();
    const base =
      q === ''
        ? byList
        : byList.filter(
            (e) =>
              (e.fullName ?? '').toLowerCase().includes(q) ||
              (e.role ?? '').toLowerCase().includes(q) ||
              (e.email ?? '').toLowerCase().includes(q) ||
              (e.team ?? '').toLowerCase().includes(q),
          );
    if (!sort) return base;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const cmp = compareBy(sort.key, now);
    return [...base].sort((a, b) => cmp(a, b) * dir);
  }, [employees, query, sort, activeList, now]);

  // Синхронизируем «видимую ленту» в глобальном сигнале — для prev/next.
  useEffect(() => {
    crmViewSignal.value = filtered.map((e) => e.id);
  }, [filtered]);

  function handleCreate(values: EmployeeFormValues): void {
    const draft = makeEmployee(values);
    const parsed = EmployeeSchema.safeParse(draft);
    if (!parsed.success) {
      const summary = parsed.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
      console.error('EmployeeSchema validation failed:', parsed.error.issues);
      toast.error(`Не удалось сохранить: ${summary || 'данные не прошли валидацию'}`);
      return;
    }
    employeesRepo.create(parsed.data);
    toast.success('Сотрудник добавлен');
    setCreateOpen(false);
  }

  function handleEdit(values: EmployeeFormValues): void {
    if (!editing) return;
    const patch: Partial<Employee> = {
      fullName: values.fullName,
      role: values.role,
      grade: values.grade,
      hireDate: values.hireDate,
      email: values.email,
      salary: values.salary,
    };
    employeesRepo.update(editing.id, patch);
    toast.success('Изменения сохранены');
    setEditing(null);
  }

  async function handleDelete(e: Employee): Promise<void> {
    const ok = await confirm({
      title: 'Удалить сотрудника?',
      body: `${e.fullName || 'Без имени'} будет удалён без возможности восстановления.`,
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    employeesRepo.remove(e.id);
    toast.success('Сотрудник удалён');
  }

  // ---- Bulk-actions ----

  function toggleRow(id: string): void {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleVisible(allOn: boolean): void {
    setSelected((s) => {
      const next = new Set(s);
      for (const e of filtered) {
        if (allOn) next.delete(e.id);
        else next.add(e.id);
      }
      return next;
    });
  }
  function clearSelection(): void {
    setSelected(new Set());
  }

  async function bulkDelete(): Promise<void> {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `Удалить ${ids.length} сотрудник(ов)?`,
      body: 'Действие необратимо. Все выбранные строки будут удалены и из локального кэша, и из Supabase.',
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    for (const id of ids) employeesRepo.remove(id);
    clearSelection();
    toast.success(`Удалено ${ids.length}`);
  }

  function applyBulkPatch(patch: Partial<Employee>, summary: string): void {
    const ids = [...selected];
    for (const id of ids) employeesRepo.update(id, patch);
    toast.success(`${summary}: ${ids.length}`);
    setBulkAction(null);
  }

  function bulkExport(): void {
    const ids = new Set(selected);
    const rows = employeesRepo.signal.value.filter((e) => ids.has(e.id));
    const blob = new Blob([JSON.stringify({ employees: rows }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employees-${rows.length}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.info(`Экспортировано ${rows.length} записей`);
  }

  const visibleIds = useMemo(() => filtered.map((e) => e.id), [filtered]);
  const visibleSelected = useMemo(
    () => visibleIds.filter((id) => selected.has(id)).length,
    [visibleIds, selected],
  );
  const allVisibleSelected = visibleIds.length > 0 && visibleSelected === visibleIds.length;

  return (
    <div class="space-y-4">
      <header class="flex flex-wrap items-center gap-3">
        <h2 class="text-2xl font-semibold">CRM — сотрудники</h2>
        <span class="text-sm text-slate-400">
          {employees.length === 0 ? 'нет записей' : `${filtered.length} из ${employees.length}`}
        </span>
        <div class="ml-auto flex items-center gap-2">
          <TextInput
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Поиск по имени / роли / email / команде"
            class="!w-80"
          />
          <Button onClick={() => setCreateOpen(true)}>+ Добавить</Button>
        </div>
      </header>

      <SmartListBar
        employees={employees}
        active={activeList}
        onChange={setActiveList}
        now={now}
      />

      {loading && employees.length === 0 ? (
        <div class="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
          Загружаем…
        </div>
      ) : employees.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <EmployeesTable
          rows={filtered}
          totalQuery={query}
          sort={sort}
          onSort={toggleSort}
          onOpen={(e) => loc.route(employeeUrl(e.id))}
          onQuickEdit={setEditing}
          onDelete={(e) => void handleDelete(e)}
          now={now}
          selected={selected}
          allVisibleSelected={allVisibleSelected}
          onToggleRow={toggleRow}
          onToggleVisible={toggleVisible}
        />
      )}

      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          onClear={clearSelection}
          onTeam={() => setBulkAction('team')}
          onGrade={() => setBulkAction('grade')}
          onPromotion={() => setBulkAction('promotion')}
          onExport={bulkExport}
          onDelete={() => void bulkDelete()}
        />
      )}

      <BulkPickerModal
        kind={bulkAction}
        onClose={() => setBulkAction(null)}
        onApply={applyBulkPatch}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Новый сотрудник"
        maxWidth="lg"
      >
        <EmployeeForm
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
          submitLabel="Добавить"
        />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Редактирование: ${editing.fullName || 'Без имени'}` : ''}
        maxWidth="lg"
      >
        <EmployeeForm initial={editing} onSubmit={handleEdit} onCancel={() => setEditing(null)} />
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------
// Smart list bar
// ---------------------------------------------------------------

function SmartListBar({
  employees,
  active,
  onChange,
  now,
}: {
  employees: Employee[];
  active: SmartListId;
  onChange: (id: SmartListId) => void;
  now: Date;
}): JSX.Element {
  const TONE_ACTIVE: Record<SmartList['tone'], string> = {
    neutral: 'bg-white/10 text-slate-100',
    red: 'bg-red-500/25 text-red-200',
    amber: 'bg-amber-500/25 text-amber-200',
    emerald: 'bg-emerald-500/25 text-emerald-200',
    blue: 'bg-blue-500/25 text-blue-200',
    purple: 'bg-purple-500/25 text-purple-200',
  };
  return (
    <nav class="flex flex-wrap gap-1.5" aria-label="Срезы списка">
      {SMART_LISTS.map((l) => {
        const isActive = l.id === active;
        const count = l.id === 'all' ? employees.length : countMatching(employees, l, now);
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => onChange(l.id)}
            class={`rounded-full px-3 py-1 text-xs transition-colors ${
              isActive
                ? TONE_ACTIVE[l.tone]
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
            }`}
          >
            {l.label}
            <span class="ml-1.5 tabular-nums text-slate-400/80">{count}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------
// Empty state и таблица
// ---------------------------------------------------------------

function EmptyState({ onCreate }: { onCreate: () => void }): JSX.Element {
  return (
    <div class="rounded-2xl border border-dashed border-white/10 bg-white/5 p-10 text-center">
      <p class="text-lg text-slate-200">Пока ни одного сотрудника</p>
      <p class="mt-1 text-sm text-slate-400">
        Добавьте первого — данные синхронизируются автоматически.
      </p>
      <div class="mt-4">
        <Button onClick={onCreate}>+ Добавить сотрудника</Button>
      </div>
    </div>
  );
}

interface EmployeesTableProps {
  rows: Employee[];
  totalQuery: string;
  sort: SortState | null;
  onSort: (key: SortKey) => void;
  onOpen: (e: Employee) => void;
  onQuickEdit: (e: Employee) => void;
  onDelete: (e: Employee) => void;
  now: Date;
  selected: Set<string>;
  allVisibleSelected: boolean;
  onToggleRow: (id: string) => void;
  onToggleVisible: (allOn: boolean) => void;
}

function EmployeesTable({
  rows,
  totalQuery,
  sort,
  onSort,
  onOpen,
  onQuickEdit,
  onDelete,
  now,
  selected,
  allVisibleSelected,
  onToggleRow,
  onToggleVisible,
}: EmployeesTableProps): JSX.Element {
  if (rows.length === 0) {
    return (
      <div class="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-slate-400">
        {totalQuery
          ? <>По запросу «{totalQuery}» ничего не найдено</>
          : <>В этом срезе пусто</>}
      </div>
    );
  }
  return (
    <div class="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
      <table class="w-full text-sm">
        <thead class="bg-white/5 text-left text-xs uppercase text-slate-400">
          <tr>
            <th class="w-8 px-3 py-3">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={() => onToggleVisible(allVisibleSelected)}
                aria-label="Выбрать все видимые строки"
                class="h-4 w-4 cursor-pointer"
              />
            </th>
            <SortableTh sort={sort} k="fullName" onSort={onSort}>ФИО</SortableTh>
            <SortableTh sort={sort} k="role" onSort={onSort}>Должность</SortableTh>
            <SortableTh sort={sort} k="team" onSort={onSort}>Команда</SortableTh>
            <SortableTh sort={sort} k="grade" onSort={onSort}>Грейд</SortableTh>
            <SortableTh sort={sort} k="risk" onSort={onSort}>Риск</SortableTh>
            <SortableTh sort={sort} k="load" onSort={onSort}>Загрузка</SortableTh>
            <th class="px-3 py-3 font-medium text-slate-400">Готовность</th>
            <SortableTh sort={sort} k="oneonone" onSort={onSort}>1-on-1</SortableTh>
            <SortableTh sort={sort} k="hireDate" onSort={onSort}>Дата найма</SortableTh>
            <th class="px-3 py-3 text-right font-medium">Действия</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const risk = calcRiskScore(e, now);
            const loadPct = Number(e.load?.currentPercent) || 0;
            const daysSince = daysSinceLastOneOnOne(e, now);
            const isSelected = selected.has(e.id);
            return (
              <tr
                key={e.id}
                class={`border-t border-white/5 ${isSelected ? 'bg-blue-500/10' : 'hover:bg-white/5'}`}
              >
                <td class="w-8 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleRow(e.id)}
                    aria-label={`Выбрать ${e.fullName}`}
                    class="h-4 w-4 cursor-pointer"
                  />
                </td>
                <td class="px-3 py-2.5">
                  <button
                    type="button"
                    class="text-left text-blue-300 hover:text-blue-200 hover:underline"
                    onClick={() => onOpen(e)}
                  >
                    {e.fullName || <span class="text-slate-500">— без имени —</span>}
                  </button>
                </td>
                <td class="px-3 py-2.5 text-slate-300">{e.role || '—'}</td>
                <td class="px-3 py-2.5 text-slate-300">{e.team || <span class="text-slate-500">—</span>}</td>
                <td class="px-3 py-2.5 text-slate-300">{e.grade}</td>
                <td class="px-3 py-2.5">
                  <RiskBadge level={risk.level} score={risk.score} />
                </td>
                <td class="px-3 py-2.5">
                  <LoadBar percent={loadPct} />
                </td>
                <td class="px-3 py-2.5">
                  <PromotionDot value={e.promotionReadiness} />
                </td>
                <td class="px-3 py-2.5">
                  <OneOnOneCell days={daysSince} />
                </td>
                <td class="px-3 py-2.5 text-slate-300 tabular-nums">{e.hireDate || '—'}</td>
                <td class="px-3 py-2.5 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => onOpen(e)}>
                    Открыть
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onQuickEdit(e)}>
                    Правка
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(e)}>
                    ×
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------
// Чипы / индикаторы
// ---------------------------------------------------------------

function RiskBadge({
  level,
  score,
}: {
  level: 'low' | 'medium' | 'high';
  score: number;
}): JSX.Element {
  const cls: Record<'low' | 'medium' | 'high', string> = {
    low: 'bg-emerald-500/20 text-emerald-300',
    medium: 'bg-amber-500/20 text-amber-300',
    high: 'bg-red-500/20 text-red-300',
  };
  const label: Record<'low' | 'medium' | 'high', string> = {
    low: 'низкий',
    medium: 'средний',
    high: 'высокий',
  };
  return (
    <span
      class={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${cls[level]}`}
      title={`Скор риска: ${score}`}
    >
      <span class="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {label[level]}
    </span>
  );
}

function LoadBar({ percent }: { percent: number }): JSX.Element {
  const p = Math.max(0, Math.min(150, percent));
  const tone =
    p > 100
      ? 'bg-red-500/70'
      : p >= 80
        ? 'bg-amber-500/70'
        : p > 0
          ? 'bg-emerald-500/70'
          : 'bg-white/10';
  return (
    <div class="flex items-center gap-2 text-xs text-slate-300 tabular-nums">
      <div class="h-1.5 w-16 overflow-hidden rounded-full bg-white/5">
        <div class={`h-full ${tone}`} style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
      <span>{percent}%</span>
    </div>
  );
}

function PromotionDot({ value }: { value: string }): JSX.Element {
  const map: Record<string, { cls: string; title: string }> = {
    'готов сейчас': { cls: 'bg-emerald-400', title: 'Готов к повышению сейчас' },
    'готов через 6 мес': { cls: 'bg-blue-400', title: 'Готов через 6 мес' },
    'готов через год': { cls: 'bg-amber-400', title: 'Готов через год' },
    'не готов': { cls: 'bg-slate-500', title: 'Не готов к повышению' },
  };
  const m = map[value] ?? map['не готов']!;
  return (
    <span class="inline-flex items-center gap-1.5 text-xs text-slate-300" title={m.title}>
      <span class={`inline-block h-2 w-2 rounded-full ${m.cls}`} />
      {value || '—'}
    </span>
  );
}

function OneOnOneCell({ days }: { days: number | null }): JSX.Element {
  if (days === null) {
    return <span class="text-xs text-red-300/80">никогда</span>;
  }
  const tone =
    days > 60
      ? 'text-red-300'
      : days > 30
        ? 'text-amber-300'
        : 'text-slate-300';
  return (
    <span class={`text-xs tabular-nums ${tone}`} title={`Последний 1-on-1 ${days} д. назад`}>
      {days} д
    </span>
  );
}

// ---------------------------------------------------------------
// Сортировка
// ---------------------------------------------------------------

function SortableTh({
  k,
  sort,
  onSort,
  children,
}: {
  k: SortKey;
  sort: SortState | null;
  onSort: (k: SortKey) => void;
  children: preact.ComponentChildren;
}): JSX.Element {
  const active = sort?.key === k;
  const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : '';
  return (
    <th class="px-3 py-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(k)}
        class={`inline-flex items-center gap-1.5 uppercase tracking-wide transition-colors ${
          active ? 'text-slate-100' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        {children}
        <span class="text-[10px]">{arrow || '↕'}</span>
      </button>
    </th>
  );
}

function compareBy(key: SortKey, now: Date): (a: Employee, b: Employee) => number {
  const collator = new Intl.Collator('ru', { sensitivity: 'base' });
  if (key === 'grade') {
    return (a, b) => (GRADE_ORDER[a.grade] ?? 99) - (GRADE_ORDER[b.grade] ?? 99);
  }
  if (key === 'hireDate') {
    return (a, b) => {
      const av = a.hireDate || '￿';
      const bv = b.hireDate || '￿';
      return av < bv ? -1 : av > bv ? 1 : 0;
    };
  }
  if (key === 'risk') {
    return (a, b) => calcRiskScore(a, now).score - calcRiskScore(b, now).score;
  }
  if (key === 'load') {
    return (a, b) => (Number(a.load?.currentPercent) || 0) - (Number(b.load?.currentPercent) || 0);
  }
  if (key === 'oneonone') {
    // Дней с последнего 1-on-1. null (никогда) — крайнее значение.
    return (a, b) => {
      const av = daysSinceLastOneOnOne(a, now);
      const bv = daysSinceLastOneOnOne(b, now);
      const an = av ?? Number.POSITIVE_INFINITY;
      const bn = bv ?? Number.POSITIVE_INFINITY;
      return an - bn;
    };
  }
  if (key === 'team') {
    return (a, b) => collator.compare(a.team || '￿', b.team || '￿');
  }
  // Доп. вычисляемые поля учтены выше; в остальных случаях — текстовая сортировка.
  return (a, b) => collator.compare(String(a[key as 'fullName' | 'role' | 'email'] ?? ''),
                                    String(b[key as 'fullName' | 'role' | 'email'] ?? ''));
}

/**
 * Конструктор Employee из формы — пустые поля + значения из формы.
 * Остальные поля заполнятся дефолтами Zod при .parse().
 */
function makeEmployee(v: EmployeeFormValues): unknown {
  return {
    id: crypto.randomUUID(),
    fullName: v.fullName,
    role: v.role,
    grade: v.grade,
    hireDate: v.hireDate,
    email: v.email,
    salary: v.salary,
    load: {},
  };
}

// Promotion order kept here for future sorting by promotion column.
void PROMO_ORDER;

// ---------------------------------------------------------------
// Bulk-action bar — закреплена снизу, видна при N > 0
// ---------------------------------------------------------------

function BulkActionBar({
  count,
  onClear,
  onTeam,
  onGrade,
  onPromotion,
  onExport,
  onDelete,
}: {
  count: number;
  onClear: () => void;
  onTeam: () => void;
  onGrade: () => void;
  onPromotion: () => void;
  onExport: () => void;
  onDelete: () => void;
}): JSX.Element {
  return (
    <div
      role="region"
      aria-label="Массовые действия"
      class="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-blue-500/40 bg-slate-900/95 px-4 py-2 shadow-lg backdrop-blur"
    >
      <span class="text-sm text-slate-100 tabular-nums">Выбрано: {count}</span>
      <Button size="sm" variant="ghost" onClick={onClear}>
        Снять
      </Button>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onTeam}>
          Команда…
        </Button>
        <Button size="sm" variant="secondary" onClick={onGrade}>
          Грейд…
        </Button>
        <Button size="sm" variant="secondary" onClick={onPromotion}>
          Готовность…
        </Button>
        <Button size="sm" variant="secondary" onClick={onExport}>
          Экспорт JSON
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          Удалить
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Модалка-пикер: общая обвязка над тремя вариантами bulk-обновления
// ---------------------------------------------------------------

const GRADES = ['Junior', 'Middle', 'Senior', 'Lead'] as const;
const PROMOTIONS = ['не готов', 'готов через 6 мес', 'готов через год', 'готов сейчас'] as const;

function BulkPickerModal({
  kind,
  onClose,
  onApply,
}: {
  kind: null | 'team' | 'grade' | 'promotion';
  onClose: () => void;
  onApply: (patch: Partial<Employee>, summary: string) => void;
}): JSX.Element {
  const teams = teamsRepo.signal.value;
  const [team, setTeam] = useState('');
  const [grade, setGrade] = useState<string>('Junior');
  const [promotion, setPromotion] = useState<string>('не готов');

  const title =
    kind === 'team'
      ? 'Назначить команду'
      : kind === 'grade'
        ? 'Назначить грейд'
        : kind === 'promotion'
          ? 'Назначить готовность к повышению'
          : '';

  function apply(): void {
    if (kind === 'team') {
      onApply({ team }, `Команда «${team || '—'}» назначена`);
    } else if (kind === 'grade') {
      onApply({ grade }, `Грейд «${grade}» назначен`);
    } else if (kind === 'promotion') {
      onApply({ promotionReadiness: promotion as Employee['promotionReadiness'] }, `Готовность «${promotion}» назначена`);
    }
  }

  return (
    <Modal open={kind !== null} onClose={onClose} title={title} maxWidth="md">
      <div class="space-y-4">
        {kind === 'team' && (
          <Field label="Команда" hint="Пусто — снять команду">
            {(p) => (
              <Select {...p} value={team} onChange={(e) => setTeam(e.currentTarget.value)}>
                <option value="">— без команды —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {kind === 'grade' && (
          <Field label="Грейд">
            {(p) => (
              <Select {...p} value={grade} onChange={(e) => setGrade(e.currentTarget.value)}>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {kind === 'promotion' && (
          <Field label="Готовность">
            {(p) => (
              <Select
                {...p}
                value={promotion}
                onChange={(e) => setPromotion(e.currentTarget.value)}
              >
                {PROMOTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" onClick={apply}>
            Применить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
