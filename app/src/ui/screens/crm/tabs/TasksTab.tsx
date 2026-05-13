import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Employee, TaskItem } from '@/data/schema';
import { employeesRepo } from '@/infra/repos';
import { toast } from '@/state/ui';
import { Button } from '@/ui/components/Button';
import { Field, Select, TextInput } from '@/ui/components/Field';

/**
 * Вкладка «Задачи». Каждый элемент — `{ text, status, due }`.
 * Дедлайн — ISO-дата; статус из 3 значений (соответствуют легаси-набору).
 */
const STATUSES = ['не начата', 'в работе', 'выполнена'] as const;

export function TasksTab({ employee }: { employee: Employee }): JSX.Element {
  const [tasks, setTasks] = useState<TaskItem[]>(employee.tasks);
  const [dirty, setDirty] = useState(false);

  function updateAt(idx: number, patch: Partial<TaskItem>): void {
    setTasks((arr) => arr.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
    setDirty(true);
  }
  function removeAt(idx: number): void {
    setTasks((arr) => arr.filter((_, i) => i !== idx));
    setDirty(true);
  }
  function add(): void {
    setTasks((arr) => [...arr, { text: '', status: 'не начата', due: '' }]);
    setDirty(true);
  }

  function handleSave(e: Event): void {
    e.preventDefault();
    const cleaned = tasks
      .map((t) => ({ ...t, text: t.text.trim() }))
      .filter((t) => t.text.length > 0);
    employeesRepo.update(employee.id, { tasks: cleaned });
    setTasks(cleaned);
    setDirty(false);
    toast.success('Задачи сохранены');
  }
  function handleReset(): void {
    setTasks(employee.tasks);
    setDirty(false);
  }

  const done = tasks.filter((t) => t.status === 'выполнена').length;

  return (
    <form onSubmit={handleSave} class="space-y-6">
      <section class="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <header class="flex items-center justify-between">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Задачи</h3>
          <span class="text-xs text-slate-500">
            {tasks.length === 0 ? 'нет задач' : `${done}/${tasks.length} выполнено`}
          </span>
        </header>

        {tasks.length === 0 && (
          <p class="text-sm text-slate-500">
            Задач пока нет. Добавьте первую — позже видна будет на дашборде.
          </p>
        )}

        <div class="space-y-3">
          {tasks.map((t, i) => (
            <div
              key={i}
              class="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_180px_160px_auto]"
            >
              <Field label="Задача">
                {(p) => (
                  <TextInput
                    {...p}
                    value={t.text}
                    onInput={(e) => updateAt(i, { text: e.currentTarget.value })}
                    placeholder="Описание задачи"
                  />
                )}
              </Field>
              <Field label="Статус">
                {(p) => (
                  <Select
                    {...p}
                    value={t.status}
                    onChange={(e) => updateAt(i, { status: e.currentTarget.value })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Дедлайн">
                {(p) => (
                  <TextInput
                    {...p}
                    type="date"
                    value={t.due}
                    onInput={(e) => updateAt(i, { due: e.currentTarget.value })}
                  />
                )}
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeAt(i)}
                aria-label="Удалить задачу"
              >
                ×
              </Button>
            </div>
          ))}
        </div>

        <Button type="button" variant="secondary" size="sm" onClick={add}>
          + Добавить задачу
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
