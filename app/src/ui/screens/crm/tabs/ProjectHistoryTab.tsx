import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import type { Employee, ProjectHistoryItem } from '@/data/schema';
import { employeesRepo } from '@/infra/repos';
import { toast } from '@/state/ui';
import { Button } from '@/ui/components/Button';
import { Field, TextArea, TextInput } from '@/ui/components/Field';

/**
 * Вкладка «История проектов». Каждый элемент — `{ name, role, from, to, achievements }`.
 * Записи отсортированы по `to desc` (текущие — пустое `to` — наверху), затем по `from desc`.
 */
export function ProjectHistoryTab({ employee }: { employee: Employee }): JSX.Element {
  const [items, setItems] = useState<ProjectHistoryItem[]>(employee.projectHistory);
  const [dirty, setDirty] = useState(false);

  const sortedView = useMemo(() => {
    // Сохраняем оригинальные индексы, чтобы updateAt/removeAt работали по ним
    // независимо от порядка отображения.
    return items
      .map((it, idx) => ({ it, idx }))
      .sort((a, b) => {
        // «текущие» (пустое to) сверху
        const aCurrent = !a.it.to;
        const bCurrent = !b.it.to;
        if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
        // Иначе по to desc, ISO-даты сравниваются лексикографически
        if (a.it.to !== b.it.to) return a.it.to < b.it.to ? 1 : -1;
        if (a.it.from !== b.it.from) return a.it.from < b.it.from ? 1 : -1;
        return 0;
      });
  }, [items]);

  function updateAt(idx: number, patch: Partial<ProjectHistoryItem>): void {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    setDirty(true);
  }
  function removeAt(idx: number): void {
    setItems((arr) => arr.filter((_, i) => i !== idx));
    setDirty(true);
  }
  function add(): void {
    setItems((arr) => [
      { name: '', role: '', from: '', to: '', achievements: '' },
      ...arr,
    ]);
    setDirty(true);
  }

  function handleSave(e: Event): void {
    e.preventDefault();
    const cleaned = items
      .map((it) => ({
        ...it,
        name: it.name.trim(),
        role: it.role.trim(),
        achievements: it.achievements.trim(),
      }))
      .filter((it) => it.name.length > 0);
    employeesRepo.update(employee.id, { projectHistory: cleaned });
    setItems(cleaned);
    setDirty(false);
    toast.success('История проектов сохранена');
  }
  function handleReset(): void {
    setItems(employee.projectHistory);
    setDirty(false);
  }

  return (
    <form onSubmit={handleSave} class="space-y-6">
      <section class="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <header class="flex items-center justify-between">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
            История проектов
          </h3>
          <Button type="button" variant="secondary" size="sm" onClick={add}>
            + Добавить
          </Button>
        </header>

        {sortedView.length === 0 && (
          <p class="text-sm text-slate-500">
            Истории проектов пока нет. Добавьте первую запись — текущий проект
            оставьте без даты окончания.
          </p>
        )}

        <ul class="space-y-4">
          {sortedView.map(({ it, idx }) => (
            <li
              key={idx}
              class="space-y-3 rounded-xl border border-white/10 bg-slate-950/30 p-4"
            >
              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Название проекта">
                  {(p) => (
                    <TextInput
                      {...p}
                      value={it.name}
                      onInput={(e) => updateAt(idx, { name: e.currentTarget.value })}
                      placeholder="Например: Перезапуск личного кабинета"
                    />
                  )}
                </Field>
                <Field label="Роль на проекте">
                  {(p) => (
                    <TextInput
                      {...p}
                      value={it.role}
                      onInput={(e) => updateAt(idx, { role: e.currentTarget.value })}
                      placeholder="Тимлид / Старший разработчик…"
                    />
                  )}
                </Field>
              </div>
              <div class="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
                <Field label="С">
                  {(p) => (
                    <TextInput
                      {...p}
                      type="date"
                      value={it.from}
                      onInput={(e) => updateAt(idx, { from: e.currentTarget.value })}
                    />
                  )}
                </Field>
                <Field label="По" hint="Пусто — текущий">
                  {(p) => (
                    <TextInput
                      {...p}
                      type="date"
                      value={it.to}
                      onInput={(e) => updateAt(idx, { to: e.currentTarget.value })}
                    />
                  )}
                </Field>
                <div class="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAt(idx)}
                    aria-label="Удалить запись"
                  >
                    Удалить
                  </Button>
                </div>
              </div>
              <Field label="Ключевые достижения">
                {(p) => (
                  <TextArea
                    {...p}
                    value={it.achievements}
                    onInput={(e) => updateAt(idx, { achievements: e.currentTarget.value })}
                    placeholder="Что сделал, какой эффект — 2-3 строки"
                  />
                )}
              </Field>
            </li>
          ))}
        </ul>
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
