import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { personalRepo } from '@/infra/repos';
import { getSession } from '@/infra/auth';
import { toast } from '@/state/ui';
import { Button } from '@/ui/components/Button';
import { Field, TextArea, TextInput } from '@/ui/components/Field';

/**
 * Экран `/personal` — личные заметки и задачи руководителя.
 *
 * Сущность `Personal` в схеме — `z.object({}).passthrough()`, поэтому
 * структура документа определяется UI: `notes: string` + массив todos.
 *
 * Сохранение:
 *  - заметки автосейвятся через 800 мс debounce (`useEffect` на changes);
 *  - чек-боксы и удаление задач — сразу;
 *  - все мутации идут через `personalRepo.save(userId, doc)` → SyncQueue → Supabase
 *    (upsert по user_id, RLS на user_id = auth.uid()).
 *
 * Если пользователь ещё не вошёл — экран ждёт сессии. Если документа
 * на сервере нет — стартуем с пустого.
 */
export interface PersonalTodo {
  id: string;
  text: string;
  done: boolean;
  due: string;
}

interface PersonalDoc {
  notes: string;
  todos: PersonalTodo[];
}

const EMPTY: PersonalDoc = { notes: '', todos: [] };

function toDoc(raw: unknown): PersonalDoc {
  if (!raw || typeof raw !== 'object') return { ...EMPTY };
  const o = raw as Record<string, unknown>;
  return {
    notes: typeof o.notes === 'string' ? o.notes : '',
    todos: Array.isArray(o.todos)
      ? o.todos
          .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
          .map((t) => ({
            id: typeof t.id === 'string' ? t.id : crypto.randomUUID(),
            text: typeof t.text === 'string' ? t.text : '',
            done: t.done === true,
            due: typeof t.due === 'string' ? t.due : '',
          }))
      : [],
  };
}

export function PersonalScreen(): JSX.Element {
  const [userId, setUserId] = useState<string | null>(null);
  const [doc, setDoc] = useState<PersonalDoc>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');
  const [newTodoText, setNewTodoText] = useState('');

  // === Подгрузка ===
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await getSession();
        if (cancelled) return;
        const uid = session?.user?.id ?? null;
        setUserId(uid);
        if (!uid) {
          setLoading(false);
          return;
        }
        await personalRepo.loadFor(uid);
        if (cancelled) return;
        setDoc(toDoc(personalRepo.get()));
      } catch (e) {
        toast.error(`Не удалось загрузить личные данные: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // === Debounced auto-save ===
  // Сохраняем 800 мс после последнего изменения; первое срабатывание
  // skip-аем (skipSave ref) при гидратации, чтобы не плодить лишний upsert.
  const skipSave = useRef(true);
  useEffect(() => {
    if (!userId) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    const t = setTimeout(() => {
      personalRepo.save(userId, doc as never);
    }, 800);
    return () => clearTimeout(t);
  }, [doc, userId]);

  function patchDoc(p: Partial<PersonalDoc>): void {
    setDoc((d) => ({ ...d, ...p }));
  }

  function addTodo(): void {
    const text = newTodoText.trim();
    if (!text) return;
    const next: PersonalTodo = { id: crypto.randomUUID(), text, done: false, due: '' };
    setDoc((d) => ({ ...d, todos: [next, ...d.todos] }));
    setNewTodoText('');
  }

  function toggleTodo(id: string): void {
    setDoc((d) => ({
      ...d,
      todos: d.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }));
  }

  function editTodoText(id: string, text: string): void {
    setDoc((d) => ({ ...d, todos: d.todos.map((t) => (t.id === id ? { ...t, text } : t)) }));
  }

  function editTodoDue(id: string, due: string): void {
    setDoc((d) => ({ ...d, todos: d.todos.map((t) => (t.id === id ? { ...t, due } : t)) }));
  }

  function removeTodo(id: string): void {
    setDoc((d) => ({ ...d, todos: d.todos.filter((t) => t.id !== id) }));
  }

  const filteredTodos = useMemo(() => {
    if (filter === 'all') return doc.todos;
    if (filter === 'open') return doc.todos.filter((t) => !t.done);
    return doc.todos.filter((t) => t.done);
  }, [doc.todos, filter]);

  const counts = useMemo(() => {
    const open = doc.todos.filter((t) => !t.done).length;
    return { open, done: doc.todos.length - open, total: doc.todos.length };
  }, [doc.todos]);

  if (loading) {
    return (
      <div class="space-y-6">
        <h2 class="text-2xl font-semibold">Личное</h2>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
          Загружаем…
        </div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div class="space-y-6">
        <h2 class="text-2xl font-semibold">Личное</h2>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
          Чтобы пользоваться личным разделом, войдите в систему.
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-6">
      <header class="flex flex-wrap items-end gap-3">
        <h2 class="text-2xl font-semibold">Личное</h2>
        <p class="text-sm text-slate-400">
          Заметки и задачи для себя. Данные приватные — другие пользователи их не видят.
        </p>
      </header>

      <section class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h3 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Заметки</h3>
        <Field label="" hint="Сохраняется автоматически через ~1 секунду после последнего изменения.">
          {(p) => (
            <TextArea
              {...p}
              value={doc.notes}
              onInput={(e) => patchDoc({ notes: e.currentTarget.value })}
              placeholder="План на квартал, мысли, идеи, что-то важное…"
              class="min-h-[16rem]"
            />
          )}
        </Field>
      </section>

      <section class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <header class="mb-3 flex flex-wrap items-center gap-3">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Задачи</h3>
          <span class="text-xs text-slate-400">
            всего {counts.total} · открытых {counts.open} · закрытых {counts.done}
          </span>
          <div class="ml-auto flex gap-1">
            <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
              Все
            </FilterButton>
            <FilterButton active={filter === 'open'} onClick={() => setFilter('open')}>
              Открытые
            </FilterButton>
            <FilterButton active={filter === 'done'} onClick={() => setFilter('done')}>
              Закрытые
            </FilterButton>
          </div>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            addTodo();
          }}
          class="mb-4 flex items-center gap-2"
        >
          <TextInput
            value={newTodoText}
            onInput={(e) => setNewTodoText(e.currentTarget.value)}
            placeholder="Что нужно сделать…"
          />
          <Button type="submit" disabled={!newTodoText.trim()}>
            + Добавить
          </Button>
        </form>

        {filteredTodos.length === 0 ? (
          <p class="text-sm text-slate-500">
            {doc.todos.length === 0
              ? 'Задач пока нет — добавьте первую сверху.'
              : 'В этом фильтре пусто.'}
          </p>
        ) : (
          <ul class="space-y-2">
            {filteredTodos.map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                onToggle={() => toggleTodo(t.id)}
                onText={(v) => editTodoText(t.id, v)}
                onDue={(v) => editTodoDue(t.id, v)}
                onRemove={() => removeTodo(t.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------
// Подкомпоненты
// ---------------------------------------------------------------

function TodoRow({
  todo,
  onToggle,
  onText,
  onDue,
  onRemove,
}: {
  todo: PersonalTodo;
  onToggle: () => void;
  onText: (v: string) => void;
  onDue: (v: string) => void;
  onRemove: () => void;
}): JSX.Element {
  return (
    <li class="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
      <input
        type="checkbox"
        checked={todo.done}
        onChange={onToggle}
        class="h-4 w-4 shrink-0 cursor-pointer"
        aria-label="Отметить выполненной"
      />
      <input
        type="text"
        value={todo.text}
        onInput={(e) => onText(e.currentTarget.value)}
        class={`min-w-0 flex-1 bg-transparent text-sm outline-none ${
          todo.done ? 'text-slate-500 line-through' : 'text-slate-100'
        }`}
      />
      <input
        type="date"
        value={todo.due}
        onInput={(e) => onDue(e.currentTarget.value)}
        class="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs"
        aria-label="Дедлайн"
      />
      <button
        type="button"
        onClick={onRemove}
        class="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-red-300"
        aria-label="Удалить задачу"
      >
        ×
      </button>
    </li>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: preact.ComponentChildren;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      class={`rounded-md px-2.5 py-1 text-xs transition-colors ${
        active ? 'bg-white/10 text-slate-100' : 'text-slate-400 hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  );
}
