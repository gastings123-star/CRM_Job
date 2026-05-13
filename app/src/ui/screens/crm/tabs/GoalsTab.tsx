import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Employee, Goal } from '@/data/schema';
import { employeesRepo } from '@/infra/repos';
import { toast } from '@/state/ui';
import { Button } from '@/ui/components/Button';
import { Field, Select, TextArea, TextInput } from '@/ui/components/Field';

const GOAL_STATUSES = ['не начата', 'в работе', 'выполнена', 'отменена'] as const;

interface Form {
  goalsCurrentPeriod: string;
  goals: Goal[];
  summaryScore: number;
  summaryComment: string;
  summaryDate: string;
}

function fromEmployee(e: Employee): Form {
  return {
    goalsCurrentPeriod: e.goalsCurrentPeriod,
    goals: e.goals,
    summaryScore: e.goalsSummary.score,
    summaryComment: e.goalsSummary.comment,
    summaryDate: e.goalsSummary.date,
  };
}

function toPatch(f: Form): Partial<Employee> {
  const cleanedGoals = f.goals
    .map((g) => ({ ...g, text: g.text.trim() }))
    .filter((g) => g.text.length > 0);
  return {
    goalsCurrentPeriod: f.goalsCurrentPeriod.trim(),
    goals: cleanedGoals,
    goalsSummary: {
      score: f.summaryScore,
      comment: f.summaryComment.trim(),
      date: f.summaryDate,
    },
  };
}

export function GoalsTab({ employee }: { employee: Employee }): JSX.Element {
  const [form, setForm] = useState<Form>(fromEmployee(employee));
  const [dirty, setDirty] = useState(false);

  function patch<K extends keyof Form>(key: K, value: Form[K]): void {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }
  function updateGoal(idx: number, p: Partial<Goal>): void {
    setForm((f) => ({
      ...f,
      goals: f.goals.map((g, i) => (i === idx ? { ...g, ...p } : g)),
    }));
    setDirty(true);
  }
  function addGoal(): void {
    setForm((f) => ({
      ...f,
      goals: [...f.goals, { text: '', status: 'в работе', progress: 0 }],
    }));
    setDirty(true);
  }
  function removeGoal(idx: number): void {
    setForm((f) => ({ ...f, goals: f.goals.filter((_, i) => i !== idx) }));
    setDirty(true);
  }

  function handleSave(e: Event): void {
    e.preventDefault();
    const p = toPatch(form);
    employeesRepo.update(employee.id, p);
    setForm({ ...form, goals: p.goals ?? [] });
    setDirty(false);
    toast.success('Цели сохранены');
  }
  function handleReset(): void {
    setForm(fromEmployee(employee));
    setDirty(false);
  }

  return (
    <form onSubmit={handleSave} class="space-y-6">
      <Section title="Цели на текущий период">
        <Field label="Формулировка периода / контекст" hint="Например, H1 2026 или OKR-цикл">
          {(p) => (
            <TextArea
              {...p}
              value={form.goalsCurrentPeriod}
              onInput={(e) => patch('goalsCurrentPeriod', e.currentTarget.value)}
            />
          )}
        </Field>

        {form.goals.length === 0 && (
          <p class="text-sm text-slate-500">Целей пока нет. Добавьте первую.</p>
        )}

        <div class="space-y-4">
          {form.goals.map((g, i) => (
            <div
              key={i}
              class="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-slate-950/30 p-3 md:grid-cols-[1fr_180px_140px_auto]"
            >
              <Field label="Цель">
                {(p) => (
                  <TextInput
                    {...p}
                    value={g.text}
                    onInput={(e) => updateGoal(i, { text: e.currentTarget.value })}
                    placeholder="Что нужно сделать?"
                  />
                )}
              </Field>
              <Field label="Статус">
                {(p) => (
                  <Select
                    {...p}
                    value={g.status}
                    onChange={(e) => updateGoal(i, { status: e.currentTarget.value })}
                  >
                    {GOAL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Прогресс, %">
                {(p) => (
                  <TextInput
                    {...p}
                    type="number"
                    min={0}
                    max={100}
                    value={g.progress}
                    onInput={(e) => {
                      const n = Number(e.currentTarget.value);
                      if (Number.isFinite(n) && n >= 0 && n <= 100) {
                        updateGoal(i, { progress: n });
                      }
                    }}
                  />
                )}
              </Field>
              <div class="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeGoal(i)}
                  aria-label="Удалить цель"
                >
                  ×
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Button type="button" variant="secondary" size="sm" onClick={addGoal}>
          + Добавить цель
        </Button>
      </Section>

      <Section title="Итоги по целям">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Оценка (1–5)">
            {(p) => (
              <TextInput
                {...p}
                type="number"
                min={1}
                max={5}
                value={form.summaryScore}
                onInput={(e) => {
                  const n = Number(e.currentTarget.value);
                  if (Number.isFinite(n) && n >= 1 && n <= 5) patch('summaryScore', n);
                }}
              />
            )}
          </Field>
          <Field label="Дата подведения итогов">
            {(p) => (
              <TextInput
                {...p}
                type="date"
                value={form.summaryDate}
                onInput={(e) => patch('summaryDate', e.currentTarget.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Комментарий по итогам">
          {(p) => (
            <TextArea
              {...p}
              value={form.summaryComment}
              onInput={(e) => patch('summaryComment', e.currentTarget.value)}
              placeholder="Что получилось, что нет, что унесли в следующий цикл"
            />
          )}
        </Field>
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
