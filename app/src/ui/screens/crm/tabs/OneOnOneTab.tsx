import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import type { Employee, OneOnOne, OneOnOneHistoryItem, TaskItem } from '@/data/schema';
import { employeesRepo } from '@/infra/repos';
import { toast } from '@/state/ui';
import { Button } from '@/ui/components/Button';
import { Field, TextArea, TextInput } from '@/ui/components/Field';
import { Modal } from '@/ui/components/Modal';

/**
 * Вкладка «1-on-1». Состоит из:
 *  - блока «следующая встреча» (дата, заметки к подготовке);
 *  - чек-листа повестки;
 *  - истории встреч (по убыванию даты), у каждой записи — раскрываемое
 *    резюме / зафиксированный чеклист / список follow-up задач;
 *  - кнопки «Завершить встречу», открывающей модалку для закрытия:
 *    она пишет запись в историю, переносит follow-up в `tasks`,
 *    сбрасывает чеклист и подсказывает дату следующей встречи (+30 дней).
 *
 * Все мутации идут через `employeesRepo.update`, схема OneOnOne допускает
 * passthrough — расширенные поля истории сохраняются.
 */
const CHECKLIST_LABELS: { key: keyof OneOnOne['agendaChecklist']; label: string }[] = [
  { key: 'feedback', label: 'Обратная связь / достижения' },
  { key: 'goals', label: 'Цели и прогресс' },
  { key: 'load', label: 'Загрузка и капасити' },
  { key: 'growth', label: 'Развитие и навыки' },
  { key: 'wellbeing', label: 'Самочувствие и климат' },
];

const EMPTY_CHECKLIST: OneOnOne['agendaChecklist'] = {
  feedback: false,
  goals: false,
  load: false,
  growth: false,
  wellbeing: false,
};

/** Расширение OneOnOneHistoryItem (через passthrough Zod). */
interface ExtHistoryItem extends OneOnOneHistoryItem {
  summary?: string;
  checklist?: OneOnOne['agendaChecklist'];
  followUps?: string[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function OneOnOneTab({ employee }: { employee: Employee }): JSX.Element {
  const [state, setState] = useState<OneOnOne>(employee.oneOnOne);
  const [dirty, setDirty] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

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

  function setHistory(idx: number, value: ExtHistoryItem): void {
    setState((s) => ({
      ...s,
      history: s.history.map((h, i) => (i === idx ? value : h)),
    }));
    setDirty(true);
  }
  function removeHistory(idx: number): void {
    setState((s) => ({ ...s, history: s.history.filter((_, i) => i !== idx) }));
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

  /**
   * Завершить встречу: открыть модалку с резюме/чеклистом/follow-up.
   * После подтверждения — апдейтит state и сразу сохраняет на сервер
   * (вместе с tasks, чтобы follow-up попали в задачи сотрудника).
   */
  function handleFinishMeeting(payload: FinishPayload): void {
    const newHistory: ExtHistoryItem = {
      date: payload.date,
      summary: payload.summary,
      checklist: payload.checklist,
      ...(payload.followUps.length > 0 ? { followUps: payload.followUps } : {}),
    };
    const nextOneOnOne: OneOnOne = {
      ...state,
      history: [newHistory, ...state.history],
      nextDate: payload.nextDate,
      prepNotes: '',
      agendaChecklist: { ...EMPTY_CHECKLIST },
      agendaExtra: '',
    };
    // Follow-up → новые задачи сверху, статус «не начата».
    const newTasks: TaskItem[] =
      payload.followUps.length > 0
        ? payload.followUps.map((t) => ({ text: t, status: 'не начата', due: '' }))
        : [];
    const tasks = [...newTasks, ...(employee.tasks ?? [])];

    setState(nextOneOnOne);
    setDirty(false);
    setCloseOpen(false);
    employeesRepo.update(employee.id, { oneOnOne: nextOneOnOne, tasks });
    toast.success(
      payload.followUps.length > 0
        ? `Встреча закрыта · +${payload.followUps.length} задач`
        : 'Встреча закрыта',
    );
  }

  const checkedCount = Object.values(state.agendaChecklist).filter(Boolean).length;

  return (
    <form onSubmit={handleSave} class="space-y-6">
      <section class="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <header class="flex items-center justify-between">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Следующая встреча
          </h3>
          <Button type="button" onClick={() => setCloseOpen(true)}>
            Завершить встречу
          </Button>
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
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
            История встреч
          </h3>
          <span class="text-xs text-slate-500">{state.history.length}</span>
        </header>

        {state.history.length === 0 && (
          <p class="text-sm text-slate-500">
            История встреч пока пустая. После завершения первой встречи запись появится здесь.
          </p>
        )}

        <ul class="space-y-3">
          {state.history.map((h, i) => (
            <HistoryRow
              key={i}
              item={h as ExtHistoryItem}
              onChange={(v) => setHistory(i, v)}
              onRemove={() => removeHistory(i)}
            />
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

      <FinishMeetingModal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        defaultDate={state.nextDate || todayIso()}
        defaultSummary={state.prepNotes}
        defaultChecklist={state.agendaChecklist}
        onSubmit={handleFinishMeeting}
      />
    </form>
  );
}

// ---------------------------------------------------------------
// Модалка «Завершить встречу»
// ---------------------------------------------------------------

interface FinishPayload {
  date: string;
  summary: string;
  checklist: OneOnOne['agendaChecklist'];
  followUps: string[];
  nextDate: string;
}

function FinishMeetingModal({
  open,
  onClose,
  defaultDate,
  defaultSummary,
  defaultChecklist,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate: string;
  defaultSummary: string;
  defaultChecklist: OneOnOne['agendaChecklist'];
  onSubmit: (p: FinishPayload) => void;
}): JSX.Element {
  // Состояние сбрасывается при каждом открытии за счёт key (см. ниже).
  return open ? (
    <Modal open onClose={onClose} title="Завершить 1-on-1" maxWidth="lg">
      <FinishMeetingBody
        defaultDate={defaultDate}
        defaultSummary={defaultSummary}
        defaultChecklist={defaultChecklist}
        onCancel={onClose}
        onSubmit={onSubmit}
      />
    </Modal>
  ) : null as unknown as JSX.Element;
}

function FinishMeetingBody({
  defaultDate,
  defaultSummary,
  defaultChecklist,
  onCancel,
  onSubmit,
}: {
  defaultDate: string;
  defaultSummary: string;
  defaultChecklist: OneOnOne['agendaChecklist'];
  onCancel: () => void;
  onSubmit: (p: FinishPayload) => void;
}): JSX.Element {
  const [date, setDate] = useState(defaultDate);
  const [summary, setSummary] = useState(defaultSummary);
  const [checklist, setChecklist] = useState<OneOnOne['agendaChecklist']>(defaultChecklist);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [newFollowUp, setNewFollowUp] = useState('');
  const suggestedNext = useMemo(() => plusDaysIso(30), []);
  const [nextDate, setNextDate] = useState(suggestedNext);

  function toggle(k: keyof OneOnOne['agendaChecklist']): void {
    setChecklist((c) => ({ ...c, [k]: !c[k] }));
  }

  function addFollowUp(): void {
    const t = newFollowUp.trim();
    if (!t) return;
    setFollowUps((arr) => [...arr, t]);
    setNewFollowUp('');
  }
  function removeFollowUp(idx: number): void {
    setFollowUps((arr) => arr.filter((_, i) => i !== idx));
  }

  function handleSubmit(): void {
    onSubmit({
      date,
      summary: summary.trim(),
      checklist,
      followUps: followUps.map((s) => s.trim()).filter(Boolean),
      nextDate,
    });
  }

  // Не используем <form> — модалка рендерится внутри внешней формы вкладки,
  // браузер вложенные формы flatten-ит и наш submit-кнопкой бы прилетал в обе.
  return (
    <div class="space-y-4">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Дата встречи">
          {(p) => (
            <TextInput {...p} type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
          )}
        </Field>
        <Field label="Следующая встреча" hint="по умолчанию +30 дней">
          {(p) => (
            <TextInput
              {...p}
              type="date"
              value={nextDate}
              onInput={(e) => setNextDate(e.currentTarget.value)}
            />
          )}
        </Field>
      </div>

      <Field label="Резюме встречи" hint="будет сохранено в историю">
        {(p) => (
          <TextArea
            {...p}
            value={summary}
            onInput={(e) => setSummary(e.currentTarget.value)}
            placeholder="Что обсудили, к чему пришли, эмоциональный фон…"
            class="min-h-[8rem]"
          />
        )}
      </Field>

      <div>
        <p class="mb-1 text-sm text-slate-300">Чеклист повестки</p>
        <ul class="grid grid-cols-1 gap-1.5 md:grid-cols-2">
          {CHECKLIST_LABELS.map(({ key, label }) => (
            <li key={key}>
              <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-white/20 bg-white/5"
                  checked={checklist[key]}
                  onChange={() => toggle(key)}
                />
                {label}
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p class="mb-1 text-sm text-slate-300">
          Follow-up задачи
          <span class="ml-1 text-xs text-slate-500">создадутся в «Задачах» сотрудника</span>
        </p>
        {followUps.length > 0 && (
          <ul class="mb-2 space-y-1">
            {followUps.map((t, i) => (
              <li key={i} class="flex items-center gap-2 rounded bg-white/5 px-2 py-1 text-sm">
                <span class="min-w-0 flex-1">{t}</span>
                <button
                  type="button"
                  onClick={() => removeFollowUp(i)}
                  class="rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-red-300"
                  aria-label="Удалить follow-up"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div class="flex items-center gap-2">
          <TextInput
            value={newFollowUp}
            onInput={(e) => setNewFollowUp(e.currentTarget.value)}
            placeholder="Что нужно сделать сотруднику…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addFollowUp();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={addFollowUp} disabled={!newFollowUp.trim()}>
            + Добавить
          </Button>
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="button" onClick={handleSubmit}>
          Завершить и сохранить
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// История встреч — раскрываемая строка
// ---------------------------------------------------------------

function HistoryRow({
  item,
  onChange,
  onRemove,
}: {
  item: ExtHistoryItem;
  onChange: (v: ExtHistoryItem) => void;
  onRemove: () => void;
}): JSX.Element {
  const checkedCount = item.checklist ? Object.values(item.checklist).filter(Boolean).length : 0;
  const followUps = item.followUps ?? [];
  return (
    <li class="rounded-lg border border-white/5 bg-white/5">
      <details>
        <summary class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-slate-100">
          <span class="tabular-nums">{item.date || '—'}</span>
          {item.summary && (
            <span class="truncate text-slate-400">{item.summary}</span>
          )}
          <span class="ml-auto flex items-center gap-2 text-xs text-slate-500">
            {item.checklist && <span>✓ {checkedCount}/5</span>}
            {followUps.length > 0 && <span>· follow-up: {followUps.length}</span>}
          </span>
        </summary>
        <div class="space-y-2 border-t border-white/5 p-3">
          <div class="grid grid-cols-[160px_1fr] items-center gap-3">
            <TextInput
              type="date"
              value={item.date}
              onInput={(e) => onChange({ ...item, date: e.currentTarget.value })}
            />
            <Button type="button" variant="ghost" size="sm" onClick={onRemove} class="justify-self-end">
              × Удалить запись
            </Button>
          </div>
          <Field label="Резюме">
            {(p) => (
              <TextArea
                {...p}
                value={item.summary ?? ''}
                onInput={(e) => onChange({ ...item, summary: e.currentTarget.value })}
                class="min-h-[5rem]"
              />
            )}
          </Field>
          {followUps.length > 0 && (
            <div>
              <p class="text-xs text-slate-400">Follow-up задачи</p>
              <ul class="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-300">
                {followUps.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}
