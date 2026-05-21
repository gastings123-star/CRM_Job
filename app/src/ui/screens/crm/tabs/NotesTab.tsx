import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import type { Employee, EmployeeNote, EmployeeNoteTone } from '@/data/schema';
import { employeesRepo } from '@/infra/repos';
import { confirm, toast } from '@/state/ui';
import { Button } from '@/ui/components/Button';
import { Field, Select, TextArea, TextInput } from '@/ui/components/Field';

/**
 * Вкладка «Заметки» на карточке сотрудника.
 *
 * Зачем: фиксировать обратную связь о сотруднике с произвольных
 * источников — кто-то похвалил / пожаловался / нейтральное наблюдение.
 *
 * Хранение: внутри `Employee.managerComments[]` (поле уже было в схеме,
 * теперь с конкретной формой EmployeeNote). Все мутации — через
 * `employeesRepo.update(empId, { managerComments: [...] })`.
 *
 * UI: форма быстрого ввода сверху, ниже — список заметок с tone-плашкой,
 * датой, источником и текстом; на каждой записи кнопки правки/удаления.
 */
const TONE_LABEL: Record<EmployeeNoteTone, string> = {
  positive: 'позитив',
  neutral: 'нейтрально',
  concern: 'тревожно',
};

const TONE_GLYPH: Record<EmployeeNoteTone, string> = {
  positive: '🟢',
  neutral: '⚪️',
  concern: '🔴',
};

const TONE_BG: Record<EmployeeNoteTone, string> = {
  positive: 'border-emerald-500/30 bg-emerald-500/5',
  neutral: 'border-white/10 bg-white/5',
  concern: 'border-red-500/30 bg-red-500/5',
};

const TONE_ORDER: EmployeeNoteTone[] = ['positive', 'neutral', 'concern'];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function NotesTab({ employee }: { employee: Employee }): JSX.Element {
  // Стабилизируем ссылку — иначе ?? [] создаёт новый массив на каждый рендер
  // и портит зависимости useMemo ниже.
  const notes = useMemo<EmployeeNote[]>(
    () => employee.managerComments ?? [],
    [employee.managerComments],
  );

  // Сортируем DESC по дате (новые сверху).
  const sorted = useMemo(() => {
    return [...notes].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [notes]);

  const counts = useMemo(() => {
    return {
      total: notes.length,
      positive: notes.filter((n) => n.tone === 'positive').length,
      neutral: notes.filter((n) => n.tone === 'neutral').length,
      concern: notes.filter((n) => n.tone === 'concern').length,
    };
  }, [notes]);

  const [editing, setEditing] = useState<EmployeeNote | null>(null);
  const [open, setOpen] = useState(false);

  function persist(next: EmployeeNote[]): void {
    employeesRepo.update(employee.id, { managerComments: next });
  }

  function handleSave(note: EmployeeNote): void {
    if (editing) {
      persist(notes.map((n) => (n.id === note.id ? note : n)));
      toast.success('Заметка обновлена');
    } else {
      persist([...notes, note]);
      toast.success('Заметка добавлена');
    }
    setOpen(false);
    setEditing(null);
  }

  async function handleDelete(note: EmployeeNote): Promise<void> {
    const ok = await confirm({
      title: 'Удалить заметку?',
      body: `Запись от ${note.date}: «${note.text.slice(0, 60)}${note.text.length > 60 ? '…' : ''}»`,
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    persist(notes.filter((n) => n.id !== note.id));
    toast.success('Заметка удалена');
  }

  return (
    <div class="space-y-4">
      <header class="flex flex-wrap items-baseline gap-3">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Заметки
        </h3>
        <span class="text-xs text-slate-500">
          всего {counts.total} · 🟢 {counts.positive} · ⚪️ {counts.neutral} · 🔴 {counts.concern}
        </span>
        <Button
          size="sm"
          class="ml-auto"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          + Заметка
        </Button>
      </header>

      {open ? (
        <NoteForm
          initial={editing}
          onCancel={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSubmit={handleSave}
        />
      ) : null}

      {sorted.length === 0 ? (
        <p class="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center text-sm text-slate-400">
          Заметок пока нет. Запишите первую — пригодится при пересмотре оценки или 1-on-1.
        </p>
      ) : (
        <ul class="space-y-2">
          {sorted.map((n) => (
            <li key={n.id} class={`rounded-lg border px-3 py-2.5 ${TONE_BG[n.tone]}`}>
              <header class="mb-1 flex flex-wrap items-baseline gap-2 text-xs">
                <span class="tabular-nums text-slate-400">{n.date || '—'}</span>
                <span class="text-slate-300">
                  {TONE_GLYPH[n.tone]} {TONE_LABEL[n.tone]}
                </span>
                {n.from && (
                  <span class="text-slate-400">
                    · от <span class="text-slate-200">{n.from}</span>
                  </span>
                )}
                <div class="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(n);
                      setOpen(true);
                    }}
                  >
                    Правка
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDelete(n)}
                    aria-label="Удалить"
                  >
                    ×
                  </Button>
                </div>
              </header>
              <p class="whitespace-pre-wrap text-sm text-slate-100">{n.text || '—'}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Форма
// ---------------------------------------------------------------

function NoteForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: EmployeeNote | null;
  onCancel: () => void;
  onSubmit: (n: EmployeeNote) => void;
}): JSX.Element {
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [tone, setTone] = useState<EmployeeNoteTone>(initial?.tone ?? 'neutral');
  const [from, setFrom] = useState(initial?.from ?? '');
  const [text, setText] = useState(initial?.text ?? '');

  function handleSubmit(e: Event): void {
    e.preventDefault();
    if (!text.trim()) {
      toast.error('Заполните текст заметки');
      return;
    }
    onSubmit({
      id: initial?.id ?? crypto.randomUUID(),
      date,
      tone,
      from: from.trim(),
      text: text.trim(),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      class="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4"
    >
      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Дата">
          {(p) => (
            <TextInput
              {...p}
              type="date"
              value={date}
              onInput={(e) => setDate(e.currentTarget.value)}
            />
          )}
        </Field>
        <Field label="От кого" hint="ФИО / роль / «от себя»">
          {(p) => (
            <TextInput
              {...p}
              value={from}
              onInput={(e) => setFrom(e.currentTarget.value)}
              placeholder="Иванов И.И."
            />
          )}
        </Field>
        <Field label="Тон">
          {(p) => (
            <Select
              {...p}
              value={tone}
              onChange={(e) => setTone(e.currentTarget.value as EmployeeNoteTone)}
            >
              {TONE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TONE_GLYPH[t]} {TONE_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field label="Текст" required>
        {(p) => (
          <TextArea
            {...p}
            value={text}
            onInput={(e) => setText(e.currentTarget.value)}
            placeholder="Что произошло, кто сказал, что важно зафиксировать…"
            class="min-h-[6rem]"
            autoFocus
          />
        )}
      </Field>

      <div class="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit" size="sm">
          {initial ? 'Сохранить' : 'Добавить'}
        </Button>
      </div>
    </form>
  );
}
