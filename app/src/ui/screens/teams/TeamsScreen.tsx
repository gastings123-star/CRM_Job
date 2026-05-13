import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { employeesRepo, teamsRepo } from '@/infra/repos';
import { TeamSchema, type Team } from '@/data/schema';
import { Button } from '@/ui/components/Button';
import { Modal } from '@/ui/components/Modal';
import { Field, TextInput } from '@/ui/components/Field';
import { confirm, toast } from '@/state/ui';

/**
 * Экран `/teams` — справочник команд / стримов.
 *
 * Сущность `Team` хранит {id, name, color, …}; репозиторий идентичен
 * employees (jsonb-payload, owner_id, RLS). На этом этапе CRUD без
 * привязки сотрудник↔team_id (legacy-поле `Employee.team` остаётся
 * строкой) — переход на uuid сделаем отдельной миграцией.
 *
 * Колонки таблицы:
 *  - цветной чип
 *  - имя
 *  - кол-во сотрудников, у которых `e.team === team.name` (живой счётчик)
 *  - действия (Правка / Удалить)
 */
const PRESET_COLORS = [
  '#534AB7', // фиолетовый
  '#E1564B', // красно-оранжевый
  '#3E8E5E', // зелёный
  '#D7A82E', // охра
  '#2C7BB6', // синий
  '#8E55C0', // лиловый
  '#5E6A75', // графит
];

export function TeamsScreen(): JSX.Element {
  const teams = teamsRepo.signal.value;
  const employees = employeesRepo.signal.value;
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [query, setQuery] = useState('');

  // Подтягиваем команды + сотрудников при заходе.
  useEffect(() => {
    teamsRepo.loadAll().catch((e: unknown) => {
      toast.error(`Не удалось загрузить команды: ${e instanceof Error ? e.message : String(e)}`);
    });
    employeesRepo.loadAll().catch(() => undefined);
  }, []);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of employees) {
      const k = e.team || '';
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [employees]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((t) => t.name.toLowerCase().includes(q));
  }, [teams, query]);

  function handleCreate(values: { name: string; color: string }): void {
    const draft = {
      id: crypto.randomUUID(),
      name: values.name.trim(),
      color: values.color,
    };
    const parsed = TeamSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error('Не удалось сохранить: данные не прошли валидацию');
      return;
    }
    teamsRepo.create(parsed.data);
    toast.success('Команда добавлена');
    setCreateOpen(false);
  }

  function handleEdit(values: { name: string; color: string }): void {
    if (!editing) return;
    teamsRepo.update(editing.id, { name: values.name.trim(), color: values.color });
    toast.success('Изменения сохранены');
    setEditing(null);
  }

  async function handleDelete(t: Team): Promise<void> {
    const count = counts.get(t.name) ?? 0;
    const ok = await confirm({
      title: 'Удалить команду?',
      body:
        count > 0
          ? `«${t.name}» используется ${count} сотрудником(ами). Поле «команда» у них останется текстом и команда исчезнет из справочника.`
          : `«${t.name}» будет удалена без возможности восстановления.`,
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    teamsRepo.remove(t.id);
    toast.success('Команда удалена');
  }

  return (
    <div class="space-y-6">
      <header class="flex flex-wrap items-center gap-3">
        <h2 class="text-2xl font-semibold">Команды</h2>
        <span class="text-sm text-slate-400">
          {teams.length === 0 ? 'справочник пуст' : `${teams.length} в базе`}
        </span>
        <div class="ml-auto flex items-center gap-2">
          <TextInput
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Поиск по имени"
            class="!w-60"
          />
          <Button onClick={() => setCreateOpen(true)}>+ Добавить</Button>
        </div>
      </header>

      {teams.length === 0 ? (
        <div class="rounded-2xl border border-dashed border-white/10 bg-white/5 p-10 text-center">
          <p class="text-lg text-slate-200">Команд ещё нет</p>
          <p class="mt-1 text-sm text-slate-400">
            Создайте первую — потом сможете привязывать к ней сотрудников в карточке.
          </p>
          <div class="mt-4">
            <Button onClick={() => setCreateOpen(true)}>+ Добавить команду</Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-slate-400">
          По запросу «{query}» ничего не найдено
        </div>
      ) : (
        <div class="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <table class="w-full text-sm">
            <thead class="bg-white/5 text-left text-xs uppercase text-slate-400">
              <tr>
                <th class="px-4 py-3 font-medium">Цвет</th>
                <th class="px-4 py-3 font-medium">Название</th>
                <th class="px-4 py-3 font-medium">Сотрудников</th>
                <th class="px-4 py-3 text-right font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} class="border-t border-white/5 hover:bg-white/5">
                  <td class="px-4 py-2.5">
                    <span
                      class="inline-block h-4 w-4 rounded"
                      style={{ backgroundColor: t.color }}
                      aria-label={t.color}
                    />
                  </td>
                  <td class="px-4 py-2.5">
                    <button
                      type="button"
                      class="text-left text-blue-300 hover:text-blue-200 hover:underline"
                      onClick={() => setEditing(t)}
                    >
                      {t.name}
                    </button>
                  </td>
                  <td class="px-4 py-2.5 text-slate-300">{counts.get(t.name) ?? 0}</td>
                  <td class="px-4 py-2.5 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                      Правка
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void handleDelete(t)}>
                      Удалить
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Новая команда"
        maxWidth="md"
      >
        <TeamForm
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
          submitLabel="Добавить"
        />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Команда «${editing.name}»` : ''}
        maxWidth="md"
      >
        <TeamForm
          initial={editing}
          onSubmit={handleEdit}
          onCancel={() => setEditing(null)}
        />
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------
// Внутренняя форма команды
// ---------------------------------------------------------------

interface TeamFormValues {
  name: string;
  color: string;
}

function TeamForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Сохранить',
}: {
  initial?: Team | null;
  onSubmit: (v: TeamFormValues) => void;
  onCancel: () => void;
  submitLabel?: string;
}): JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[0]!);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: Event): void {
    e.preventDefault();
    if (!name.trim()) {
      setError('Обязательное поле');
      return;
    }
    setError(null);
    onSubmit({ name, color });
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-4">
      <Field label="Название" required error={error ?? undefined}>
        {(p) => (
          <TextInput
            {...p}
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="ЕФС / Сити+ / Знание о клиенте"
            autoFocus
          />
        )}
      </Field>

      <div>
        <p class="mb-1 text-sm text-slate-300">Цвет</p>
        <div class="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              class={`h-8 w-8 rounded-full border-2 transition-transform ${
                color === c ? 'border-white scale-110' : 'border-white/10 hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div class="mt-2 flex items-center gap-2">
          <span class="text-xs text-slate-500">или свой:</span>
          <input
            type="color"
            value={color}
            onInput={(e) => setColor(e.currentTarget.value)}
            class="h-7 w-12 cursor-pointer rounded bg-transparent"
          />
          <span class="text-xs text-slate-500 tabular-nums">{color}</span>
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
