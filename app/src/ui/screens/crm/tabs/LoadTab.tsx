import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Employee, Load, Period } from '@/data/schema';
import { employeesRepo } from '@/infra/repos';
import { toast } from '@/state/ui';
import { Button } from '@/ui/components/Button';
import { Field, Select, TextInput } from '@/ui/components/Field';

const STATUSES = ['доступен', 'частично занят', 'занят', 'в отпуске', 'на больничном'] as const;

interface Form {
  currentDays: number;
  currentPercent: number;
  capacityQuarter: number;
  capacityQtr: string;
  status: string;
  nextMonthPlan: number;
  vacations: Period[];
  sickLeaves: Period[];
  projects: string[];
}

function fromLoad(l: Load): Form {
  return {
    currentDays: l.currentDays,
    currentPercent: l.currentPercent,
    capacityQuarter: l.capacityQuarter,
    capacityQtr: l.capacityQtr,
    status: l.status || 'доступен',
    nextMonthPlan: l.nextMonthPlan,
    vacations: l.vacations.length > 0 ? l.vacations : [],
    sickLeaves: l.sickLeaves.length > 0 ? l.sickLeaves : [],
    projects: l.projects,
  };
}

function toLoad(f: Form, prev: Load): Load {
  return {
    ...prev,
    currentDays: f.currentDays,
    currentPercent: f.currentPercent,
    capacityQuarter: f.capacityQuarter,
    capacityQtr: f.capacityQtr.trim(),
    status: f.status,
    nextMonthPlan: f.nextMonthPlan,
    vacations: f.vacations.filter((p) => p.from || p.to),
    sickLeaves: f.sickLeaves.filter((p) => p.from || p.to),
    projects: f.projects.map((p) => p.trim()).filter(Boolean),
  };
}

export function LoadTab({ employee }: { employee: Employee }): JSX.Element {
  const [form, setForm] = useState<Form>(fromLoad(employee.load));
  const [dirty, setDirty] = useState(false);

  function patch<K extends keyof Form>(key: K, value: Form[K]): void {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  function setPeriod(
    field: 'vacations' | 'sickLeaves',
    idx: number,
    side: 'from' | 'to',
    value: string,
  ): void {
    setForm((f) => {
      const next = f[field].slice();
      const item = next[idx] ?? { from: '', to: '' };
      next[idx] = { ...item, [side]: value };
      return { ...f, [field]: next };
    });
    setDirty(true);
  }

  function addPeriod(field: 'vacations' | 'sickLeaves'): void {
    setForm((f) => ({ ...f, [field]: [...f[field], { from: '', to: '' }] }));
    setDirty(true);
  }

  function removePeriod(field: 'vacations' | 'sickLeaves', idx: number): void {
    setForm((f) => ({ ...f, [field]: f[field].filter((_, i) => i !== idx) }));
    setDirty(true);
  }

  function setProject(idx: number, value: string): void {
    setForm((f) => {
      const next = f.projects.slice();
      next[idx] = value;
      return { ...f, projects: next };
    });
    setDirty(true);
  }
  function addProject(): void {
    setForm((f) => ({ ...f, projects: [...f.projects, ''] }));
    setDirty(true);
  }
  function removeProject(idx: number): void {
    setForm((f) => ({ ...f, projects: f.projects.filter((_, i) => i !== idx) }));
    setDirty(true);
  }

  function handleSave(e: Event): void {
    e.preventDefault();
    employeesRepo.update(employee.id, { load: toLoad(form, employee.load) });
    setDirty(false);
    toast.success('Сохранено');
  }
  function handleReset(): void {
    setForm(fromLoad(employee.load));
    setDirty(false);
  }

  return (
    <form onSubmit={handleSave} class="space-y-6">
      <Section title="Текущий статус">
        <Grid cols={3}>
          <Field label="Статус доступности">
            {(p) => (
              <Select
                {...p}
                value={form.status}
                onChange={(e) => patch('status', e.currentTarget.value)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Загрузка сейчас, %">
            {(p) => (
              <TextInput
                {...p}
                type="number"
                min={0}
                max={200}
                value={form.currentPercent}
                onInput={(e) => patch('currentPercent', toNumber(e.currentTarget.value))}
              />
            )}
          </Field>
          <Field label="Загружено, ЧД">
            {(p) => (
              <TextInput
                {...p}
                type="number"
                min={0}
                value={form.currentDays}
                onInput={(e) => patch('currentDays', toNumber(e.currentTarget.value))}
              />
            )}
          </Field>
        </Grid>
      </Section>

      <Section title="Capacity на квартал">
        <Grid cols={2}>
          <Field label="Метка квартала" hint="Например, Q2 2026">
            {(p) => (
              <TextInput
                {...p}
                value={form.capacityQtr}
                onInput={(e) => patch('capacityQtr', e.currentTarget.value)}
                placeholder="Q2 2026"
              />
            )}
          </Field>
          <Field label="Capacity, ЧД">
            {(p) => (
              <TextInput
                {...p}
                type="number"
                min={0}
                value={form.capacityQuarter}
                onInput={(e) => patch('capacityQuarter', toNumber(e.currentTarget.value))}
              />
            )}
          </Field>
        </Grid>
        <Field label="План на следующий месяц, ЧД">
          {(p) => (
            <TextInput
              {...p}
              type="number"
              min={0}
              value={form.nextMonthPlan}
              onInput={(e) => patch('nextMonthPlan', toNumber(e.currentTarget.value))}
            />
          )}
        </Field>
      </Section>

      <Section title="Отпуска">
        <PeriodList
          items={form.vacations}
          onAdd={() => addPeriod('vacations')}
          onRemove={(i) => removePeriod('vacations', i)}
          onChange={(i, side, v) => setPeriod('vacations', i, side, v)}
          emptyHint="Отпусков пока нет"
        />
      </Section>

      <Section title="Больничные">
        <PeriodList
          items={form.sickLeaves}
          onAdd={() => addPeriod('sickLeaves')}
          onRemove={(i) => removePeriod('sickLeaves', i)}
          onChange={(i, side, v) => setPeriod('sickLeaves', i, side, v)}
          emptyHint="Больничных пока нет"
        />
      </Section>

      <Section title="Текущие проекты">
        {form.projects.length === 0 && (
          <p class="text-sm text-slate-500">Проектов не указано</p>
        )}
        <div class="space-y-2">
          {form.projects.map((p, i) => (
            <div key={i} class="flex items-center gap-2">
              <TextInput
                value={p}
                onInput={(e) => setProject(i, e.currentTarget.value)}
                placeholder="Название проекта / эпика"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeProject(i)}
                aria-label="Удалить"
              >
                ×
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={addProject}>
          + Добавить проект
        </Button>
      </Section>

      <footer class="sticky bottom-0 -mx-2 flex items-center justify-end gap-2 border-t border-white/10 bg-slate-950/80 px-2 py-3 backdrop-blur">
        {dirty && <span class="mr-auto text-sm text-amber-300">Есть несохранённые изменения</span>}
        <Button type="button" variant="secondary" onClick={handleReset} disabled={!dirty}>
          Отменить
        </Button>
        <Button type="submit" disabled={!dirty}>
          Сохранить
        </Button>
      </footer>
    </form>
  );
}

// ---------------------------------------------------------------
// Подкомпоненты
// ---------------------------------------------------------------

function PeriodList({
  items,
  onAdd,
  onRemove,
  onChange,
  emptyHint,
}: {
  items: Period[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChange: (i: number, side: 'from' | 'to', v: string) => void;
  emptyHint: string;
}): JSX.Element {
  return (
    <div class="space-y-3">
      {items.length === 0 && <p class="text-sm text-slate-500">{emptyHint}</p>}
      {items.map((p, i) => (
        <div key={i} class="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <Field label="С">
            {(props) => (
              <TextInput
                {...props}
                type="date"
                value={p.from}
                onInput={(e) => onChange(i, 'from', e.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="По">
            {(props) => (
              <TextInput
                {...props}
                type="date"
                value={p.to}
                onInput={(e) => onChange(i, 'to', e.currentTarget.value)}
              />
            )}
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(i)}
            aria-label="Удалить период"
          >
            ×
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
        + Добавить период
      </Button>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: preact.ComponentChildren;
}): JSX.Element {
  return (
    <section class="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div class="space-y-3">{children}</div>
    </section>
  );
}

function Grid({
  cols,
  children,
}: {
  cols: 2 | 3;
  children: preact.ComponentChildren;
}): JSX.Element {
  const cls =
    cols === 3 ? 'grid grid-cols-1 gap-4 md:grid-cols-3' : 'grid grid-cols-1 gap-4 md:grid-cols-2';
  return <div class={cls}>{children}</div>;
}

function toNumber(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
