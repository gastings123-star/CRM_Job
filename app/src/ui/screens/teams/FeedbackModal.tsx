import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type {
  FeedbackActionItem,
  FeedbackMood,
  FeedbackSource,
  TeamFeedback,
} from '@/data/schema';
import { TeamFeedbackSchema } from '@/data/schema';
import { feedbackRepo } from '@/infra/repos';
import { confirm, toast } from '@/state/ui';
import { Button } from '@/ui/components/Button';
import { Field, Select, TextArea, TextInput } from '@/ui/components/Field';
import { Modal } from '@/ui/components/Modal';
import { MOOD_GLYPH, MOOD_LABEL, SOURCE_LABEL } from '@/domain/feedback';

const SOURCES: FeedbackSource[] = ['dpo', 'lead', 'peer', 'self'];
const MOODS: FeedbackMood[] = ['positive', 'neutral', 'concern'];

export interface FeedbackModalProps {
  open: boolean;
  teamId: string;
  teamName: string;
  existing?: TeamFeedback | undefined;
  onClose: () => void;
}

export function FeedbackModal(props: FeedbackModalProps): JSX.Element | null {
  if (!props.open) return null;
  return (
    <Modal open onClose={props.onClose} title={titleFor(props)} maxWidth="lg">
      <FeedbackForm {...props} />
    </Modal>
  );
}

function titleFor(p: FeedbackModalProps): string {
  if (p.existing) return `Обратная связь · ${p.existing.date}`;
  return `Новая запись · ${p.teamName}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function FeedbackForm({ teamId, existing, onClose }: FeedbackModalProps): JSX.Element {
  const [date, setDate] = useState(existing?.date ?? todayIso());
  const [source, setSource] = useState<FeedbackSource>(existing?.source ?? 'dpo');
  const [author, setAuthor] = useState(existing?.author ?? '');
  const [mood, setMood] = useState<FeedbackMood>(existing?.mood ?? 'neutral');
  const [themes, setThemes] = useState<string>(
    (existing?.themes ?? []).join(', '),
  );
  const [note, setNote] = useState(existing?.note ?? '');
  const [items, setItems] = useState<FeedbackActionItem[]>(existing?.actionItems ?? []);

  useEffect(() => {
    if (existing) {
      setDate(existing.date);
      setSource(existing.source);
      setAuthor(existing.author);
      setMood(existing.mood);
      setThemes(existing.themes.join(', '));
      setNote(existing.note);
      setItems(existing.actionItems);
    }
  }, [existing]);

  function addItem(): void {
    setItems((it) => [
      ...it,
      { id: crypto.randomUUID(), text: '', done: false, due: '' },
    ]);
  }
  function patchItem(id: string, p: Partial<FeedbackActionItem>): void {
    setItems((it) => it.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }
  function removeItem(id: string): void {
    setItems((it) => it.filter((x) => x.id !== id));
  }

  function handleSave(e: Event): void {
    e.preventDefault();
    const themesList = themes
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const draft = {
      id: existing?.id ?? crypto.randomUUID(),
      teamId,
      date,
      source,
      author: author.trim(),
      mood,
      themes: themesList,
      note: note.trim(),
      actionItems: items.filter((it) => it.text.trim() !== ''),
    };
    const parsed = TeamFeedbackSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error(`Не удалось сохранить: ${parsed.error.issues[0]?.message ?? 'валидация'}`);
      return;
    }
    if (existing) {
      feedbackRepo.update(existing.id, parsed.data);
      toast.success('Запись обновлена');
    } else {
      feedbackRepo.create(parsed.data);
      toast.success('Запись сохранена');
    }
    onClose();
  }

  async function handleDelete(): Promise<void> {
    if (!existing) return;
    const ok = await confirm({
      title: 'Удалить запись обратной связи?',
      body: `Запись от ${existing.date}. Действие необратимо.`,
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    feedbackRepo.remove(existing.id);
    toast.success('Запись удалена');
    onClose();
  }

  return (
    <form onSubmit={handleSave} class="space-y-4">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Дата встречи" required>
          {(p) => (
            <TextInput
              {...p}
              type="date"
              value={date}
              onInput={(e) => setDate(e.currentTarget.value)}
            />
          )}
        </Field>
        <Field label="Источник">
          {(p) => (
            <Select
              {...p}
              value={source}
              onChange={(e) => setSource(e.currentTarget.value as FeedbackSource)}
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Автор" hint="имя DPO / лида (если их несколько)">
          {(p) => (
            <TextInput
              {...p}
              value={author}
              onInput={(e) => setAuthor(e.currentTarget.value)}
              placeholder="Иванов И.И."
            />
          )}
        </Field>
      </div>

      <Field label="Настроение">
        {(p) => (
          <div class="flex gap-2" {...p}>
            {MOODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMood(m)}
                class={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  mood === m
                    ? 'border-blue-500 bg-blue-500/20 text-slate-100'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                }`}
              >
                <span class="mr-1">{MOOD_GLYPH[m]}</span>
                {MOOD_LABEL[m]}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label="Темы" hint="через запятую — «ресурсы, процессы, найм»">
        {(p) => (
          <TextInput
            {...p}
            value={themes}
            onInput={(e) => setThemes(e.currentTarget.value)}
            placeholder="ресурсы, коммуникация, найм"
          />
        )}
      </Field>

      <Field label="Резюме встречи">
        {(p) => (
          <TextArea
            {...p}
            value={note}
            onInput={(e) => setNote(e.currentTarget.value)}
            placeholder="Что обсудили, что важно зафиксировать…"
            class="min-h-[8rem]"
          />
        )}
      </Field>

      <div>
        <div class="mb-2 flex items-center justify-between">
          <h4 class="text-sm font-semibold text-slate-300">
            Action items
            <span class="ml-2 text-xs font-normal text-slate-500">мои обязательства из встречи</span>
          </h4>
          <Button type="button" size="sm" variant="secondary" onClick={addItem}>
            + Пункт
          </Button>
        </div>
        {items.length === 0 ? (
          <p class="text-sm text-slate-500">Пока ничего. Добавьте обязательство.</p>
        ) : (
          <ul class="space-y-2">
            {items.map((it) => (
              <li key={it.id} class="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                <input
                  type="checkbox"
                  checked={it.done}
                  onChange={(e) => patchItem(it.id, { done: e.currentTarget.checked })}
                  class="h-4 w-4 cursor-pointer"
                  aria-label="Выполнено"
                />
                <input
                  type="text"
                  value={it.text}
                  onInput={(e) => patchItem(it.id, { text: e.currentTarget.value })}
                  placeholder="Что нужно сделать"
                  class={`min-w-0 flex-1 bg-transparent text-sm outline-none ${
                    it.done ? 'text-slate-500 line-through' : 'text-slate-100'
                  }`}
                />
                <input
                  type="date"
                  value={it.due}
                  onInput={(e) => patchItem(it.id, { due: e.currentTarget.value })}
                  class="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs"
                  aria-label="Срок"
                />
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  class="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-red-300"
                  aria-label="Удалить пункт"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div class="flex items-center gap-2 pt-2">
        {existing && (
          <Button type="button" variant="danger" size="sm" onClick={() => void handleDelete()}>
            Удалить
          </Button>
        )}
        <div class="ml-auto flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit">{existing ? 'Сохранить' : 'Создать'}</Button>
        </div>
      </div>
    </form>
  );
}
