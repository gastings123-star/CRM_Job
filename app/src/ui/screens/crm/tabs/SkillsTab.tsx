import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Employee, Skill } from '@/data/schema';
import { employeesRepo } from '@/infra/repos';
import { toast } from '@/state/ui';
import { Button } from '@/ui/components/Button';
import { Field, TextInput } from '@/ui/components/Field';

/**
 * Вкладка «Навыки». Каждый навык — `{ name, level: 0..5 }`.
 * Уровень визуализирован как 5 точек: пустые / закрашенные.
 */
export function SkillsTab({ employee }: { employee: Employee }): JSX.Element {
  const [skills, setSkills] = useState<Skill[]>(employee.skills);
  const [dirty, setDirty] = useState(false);

  function updateAt(idx: number, patch: Partial<Skill>): void {
    setSkills((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    setDirty(true);
  }
  function removeAt(idx: number): void {
    setSkills((arr) => arr.filter((_, i) => i !== idx));
    setDirty(true);
  }
  function add(): void {
    setSkills((arr) => [...arr, { name: '', level: 0 }]);
    setDirty(true);
  }

  function handleSave(e: Event): void {
    e.preventDefault();
    const cleaned = skills
      .map((s) => ({ ...s, name: s.name.trim() }))
      .filter((s) => s.name.length > 0);
    employeesRepo.update(employee.id, { skills: cleaned });
    setSkills(cleaned);
    setDirty(false);
    toast.success('Навыки сохранены');
  }
  function handleReset(): void {
    setSkills(employee.skills);
    setDirty(false);
  }

  return (
    <form onSubmit={handleSave} class="space-y-6">
      <section class="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <header class="flex items-center justify-between">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Навыки</h3>
          <span class="text-xs text-slate-500">{skills.length}</span>
        </header>

        {skills.length === 0 && (
          <p class="text-sm text-slate-500">
            Навыки не указаны. Добавьте первый — оцените уровень по шкале 0–5.
          </p>
        )}

        <div class="space-y-3">
          {skills.map((s, i) => (
            <div key={i} class="grid grid-cols-[1fr_auto_auto] items-end gap-3">
              <Field label="Навык">
                {(p) => (
                  <TextInput
                    {...p}
                    value={s.name}
                    onInput={(e) => updateAt(i, { name: e.currentTarget.value })}
                    placeholder="React, SQL, переговоры…"
                  />
                )}
              </Field>
              <LevelPicker level={s.level} onChange={(lvl) => updateAt(i, { level: lvl })} />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeAt(i)}
                aria-label="Удалить навык"
              >
                ×
              </Button>
            </div>
          ))}
        </div>

        <Button type="button" variant="secondary" size="sm" onClick={add}>
          + Добавить навык
        </Button>
      </section>

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
// 5-точечный селектор уровня
// ---------------------------------------------------------------

function LevelPicker({
  level,
  onChange,
}: {
  level: number;
  onChange: (lvl: number) => void;
}): JSX.Element {
  return (
    <div class="flex items-center gap-1" role="radiogroup" aria-label="Уровень навыка">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= level;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === level}
            aria-label={`Уровень ${n}`}
            onClick={() => onChange(n === level ? 0 : n)}
            class={`h-5 w-5 rounded-full border transition-colors ${
              active
                ? 'border-blue-400 bg-blue-500/60'
                : 'border-white/20 bg-white/5 hover:bg-white/10'
            }`}
          />
        );
      })}
      <span class="ml-2 w-6 text-right text-xs text-slate-400">{level}</span>
    </div>
  );
}
