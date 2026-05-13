import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Employee, OneOnOne, OneOnOneHistoryItem } from '@/data/schema';
import { employeesRepo } from '@/infra/repos';
import { toast } from '@/state/ui';
import { Button } from '@/ui/components/Button';
import { Field, TextArea, TextInput } from '@/ui/components/Field';

/**
 * Вкладка «1-on-1». Дата следующей встречи, чеклист повестки, заметки,
 * история проведённых встреч (по убыванию дат). При сохранении пишем
 * целиком `oneOnOne` — Zod-схема разрешает passthrough, так что
 * сторонние поля (если когда-то добавятся в payload) не теряются.
 */
const CHECKLIST_LABELS: { key: keyof OneOnOne['agendaChecklist']; label: string }[] = [
  { key: 'feedback', label: 'Обратная связь / достижения' },
  { key: 'goals', label: 'Цели и прогресс' },
  { key: 'load', label: 'Загрузка и капасити' },
  { key: 'growth', label: 'Развитие и навыки' },
  { key: 'wellbeing', label: 'Самочувствие и климат' },
];

export function OneOnOneTab({ employee }: { employee: Employee }): JSX.Element {
  const [state, setState] = useState<OneOnOne>(employee.oneOnOne);
  const [dirty, setDirty] = useState(false);

  function patch<K extends keyof OneOnOne>(key: K, value: OneOnOne[K]): void {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }
  function toggleChecklist(key: keyof OneOnOne['agendaChecklist']): void {
    setState((s) => ({
      ...s,
      agendaChecklist: { ...s.agendaChecklist, [key]: !s.agendaChecklist[key] },
    }));
    setDirty(true);
  }

  function setHistory(idx: number, value: OneOnOneHistoryItem): void {
    setState((s) => ({
      ...s,
      history: s.history.map((h, i) => (i === idx ? value : h)),
    }));
    setDirty(true);
  }
  function addHistory(): void {
    setState((s) => ({
      ...s,
      history: [{ date: new Date().toISOString().slice(0, 10) }, ...s.history],
    }));
    setDirty(true);
  }
  function removeHistory(idx: number): void {
    setState((s) => ({ ...s, history: s.history.filter((_, i) => i !== idx) }));
    setDirty(true);
  }

  /** «Провести встречу сегодня» — переносит nextDate в историю, очищает поле. */
  function markHeldToday(): void {
    const today = new Date().toISOString().slice(0, 10);
    setState((s) => ({
      ...s,
      history: [{ date: s.nextDate || today }, ...s.history],
      nextDate: '',
      prepNotes: '',
      agendaChecklist: { feedback: false, goals: false, load: false, growth: false, wellbeing: false },
    }));
    setDirty(true);
  }

  function handleSave(e: Event): void {
    e.preventDefault();
    const cleaned: OneOnOne = {
      ...state,
      prepNotes: state.prepNotes.trim(),
      agendaExtra: state.agendaExtra.trim(),
      history: state.history.filter((h) => h.date),
    };
    employeesRepo.update(employee.id, { oneOnOne: cleaned });
    setState(cleaned);
    setDirty(false);
    toast.success('1-on-1 сохранён');
  }
  function handleReset(): void {
    setState(employee.oneOnOne);
    setDirty(false);
  }

  const checkedCount = Object.values(state.agendaChecklist).filter(Boolean).length;

  return (
    <form onSubmit={handleSave} class="space-y-6">
      <section class="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <header class="flex items-center justify-between">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Следующая встреча
          </h3>
          {state.nextDate && (
            <Button type="button" variant="secondary" size="sm" onClick={markHeldToday}>
              Отметить как проведённую
            </Button>
          )}
        </header>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Дата следующей 1-on-1">
            {(p) => (
              <TextInput
                {...p}
                type="date"
                value={state.nextDate}
                onInput={(e) => patch('nextDate', e.currentTarget.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Заметки к подготовке">
          {(p) => (
            <TextArea
              {...p}
              value={state.prepNotes}
              onInput={(e) => patch('prepNotes', e.currentTarget.value)}
              placeholder="Что обсудить, что узнать, что напомнить…"
            />
          )}
        </Field>
      </section>

      <section class="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
        <header class="flex items-center justify-between">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Чеклист повестки
          </h3>
          <span class="text-xs text-slate-500">{checkedCount}/5 пунктов</span>
        </header>
        <ul class="space-y-2">
          {CHECKLIST_LABELS.map(({ key, label }) => (
            <li key={key}>
              <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-white/20 bg-white/5"
                  checked={state.agendaChecklist[key]}
                  onChange={() => toggleChecklist(key)}
                />
                {label}
              </label>
            </li>
          ))}
        </ul>
        <Field label="Дополнительные пункты повестки">
          {(p) => (
            <TextArea
              {...p}
              value={state.agendaExtra}
              onInput={(e) => patch('agendaExtra', e.currentTarget.value)}
              placeholder="Что ещё обсудить, помимо стандартного"
            />
          )}
        </Field>
      </section>

      <section class="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
        <header class="flex items-center justify-between">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">История встреч</h3>
          <Button type="button" variant="secondary" size="sm" onClick={addHistory}>
            + Добавить
          </Button>
        </header>

        {state.history.length === 0 && (
          <p class="text-sm text-slate-500">История встреч пока пустая.</p>
        )}

        <ul class="space-y-2">
          {state.history.map((h, i) => (
            <li key={i} class="grid grid-cols-[160px_1fr_auto] items-center gap-3">
              <TextInput
                type="date"
                value={h.date}
                onInput={(e) => setHistory(i, { ...h, date: e.currentTarget.value })}
              />
              <span class="text-xs text-slate-500">
                {h.date ? `Проведена ${h.date}` : 'без даты'}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeHistory(i)}
                aria-label="Удалить запись"
              >
                ×
              </Button>
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
