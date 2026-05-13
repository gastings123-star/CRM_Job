import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { employeesRepo, projectsRepo } from '@/infra/repos';
import { ProjectSchema, type Project } from '@/data/schema';
import { Button } from '@/ui/components/Button';
import { Modal } from '@/ui/components/Modal';
import { Field, Select, TextInput } from '@/ui/components/Field';
import { confirm, toast } from '@/state/ui';

/**
 * Экран `/projects` — справочник проектов / эпиков.
 *
 * Связь с сотрудниками — пока через строку: `Employee.load.projects: string[]`.
 * Счётчик сотрудников в строке проекта = сколько у кого-то в `load.projects`
 * упомянуто это имя. Переход на uuid-связь — отдельной миграцией позднее.
 */
const STATUSES = ['активный', 'на паузе', 'завершён', 'отменён'] as const;

const STATUS_TONE: Record<string, string> = {
  активный: 'bg-emerald-500/20 text-emerald-300',
  'на паузе': 'bg-amber-500/20 text-amber-300',
  завершён: 'bg-slate-500/20 text-slate-300',
  отменён: 'bg-red-500/20 text-red-300',
};

export function ProjectsScreen(): JSX.Element {
  const projects = projectsRepo.signal.value;
  const employees = employeesRepo.signal.value;
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    projectsRepo.loadAll().catch((e: unknown) => {
      toast.error(`Не удалось загрузить проекты: ${e instanceof Error ? e.message : String(e)}`);
    });
    employeesRepo.loadAll().catch(() => undefined);
  }, []);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of employees) {
      for (const p of e.load?.projects ?? []) {
        if (!p) continue;
        m.set(p, (m.get(p) ?? 0) + 1);
      }
    }
    return m;
  }, [employees]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.status.toLowerCase().includes(q),
    );
  }, [projects, query]);

  function handleCreate(v: { name: string; status: string }): void {
    const draft = { id: crypto.randomUUID(), name: v.name.trim(), status: v.status };
    const parsed = ProjectSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error('Не удалось сохранить: данные не прошли валидацию');
      return;
    }
    projectsRepo.create(parsed.data);
    toast.success('Проект добавлен');
    setCreateOpen(false);
  }

  function handleEdit(v: { name: string; status: string }): void {
    if (!editing) return;
    projectsRepo.update(editing.id, { name: v.name.trim(), status: v.status });
    toast.success('Изменения сохранены');
    setEditing(null);
  }

  async function handleDelete(p: Project): Promise<void> {
    const count = counts.get(p.name) ?? 0;
    const ok = await confirm({
      title: 'Удалить проект?',
      body:
        count > 0
          ? `«${p.name}» упоминается у ${count} сотрудника(ов). Поле «текущие проекты» в их карточках не меняется, проект просто исчезнет из справочника.`
          : `«${p.name}» будет удалён без возможности восстановления.`,
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    projectsRepo.remove(p.id);
    toast.success('Проект удалён');
  }

  return (
    <div class="space-y-6">
      <header class="flex flex-wrap items-center gap-3">
        <h2 class="text-2xl font-semibold">Проекты</h2>
        <span class="text-sm text-slate-400">
          {projects.length === 0 ? 'справочник пуст' : `${projects.length} в базе`}
        </span>
        <div class="ml-auto flex items-center gap-2">
          <TextInput
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Поиск по имени / статусу"
            class="!w-72"
          />
          <Button onClick={() => setCreateOpen(true)}>+ Добавить</Button>
        </div>
      </header>

      {projects.length === 0 ? (
        <div class="rounded-2xl border border-dashed border-white/10 bg-white/5 p-10 text-center">
          <p class="text-lg text-slate-200">Проектов ещё нет</p>
          <p class="mt-1 text-sm text-slate-400">
            Создайте первый — потом сможете упоминать его в карточках сотрудников.
          </p>
          <div class="mt-4">
            <Button onClick={() => setCreateOpen(true)}>+ Добавить проект</Button>
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
                <th class="px-4 py-3 font-medium">Название</th>
                <th class="px-4 py-3 font-medium">Статус</th>
                <th class="px-4 py-3 font-medium">Сотрудников</th>
                <th class="px-4 py-3 text-right font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} class="border-t border-white/5 hover:bg-white/5">
                  <td class="px-4 py-2.5">
                    <button
                      type="button"
                      class="text-left text-blue-300 hover:text-blue-200 hover:underline"
                      onClick={() => setEditing(p)}
                    >
                      {p.name}
                    </button>
                  </td>
                  <td class="px-4 py-2.5">
                    {p.status ? (
                      <span
                        class={`rounded-full px-2 py-0.5 text-xs ${
                          STATUS_TONE[p.status] ?? 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {p.status}
                      </span>
                    ) : (
                      <span class="text-slate-500">—</span>
                    )}
                  </td>
                  <td class="px-4 py-2.5 text-slate-300">{counts.get(p.name) ?? 0}</td>
                  <td class="px-4 py-2.5 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                      Правка
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void handleDelete(p)}>
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
        title="Новый проект"
        maxWidth="md"
      >
        <ProjectForm
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
          submitLabel="Добавить"
        />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Проект «${editing.name}»` : ''}
        maxWidth="md"
      >
        <ProjectForm initial={editing} onSubmit={handleEdit} onCancel={() => setEditing(null)} />
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------
// Форма проекта
// ---------------------------------------------------------------

function ProjectForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Сохранить',
}: {
  initial?: Project | null;
  onSubmit: (v: { name: string; status: string }) => void;
  onCancel: () => void;
  submitLabel?: string;
}): JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'активный');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: Event): void {
    e.preventDefault();
    if (!name.trim()) {
      setError('Обязательное поле');
      return;
    }
    setError(null);
    onSubmit({ name, status });
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-4">
      <Field label="Название" required error={error ?? undefined}>
        {(p) => (
          <TextInput
            {...p}
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="Атрибуты клиента / Pre-fill / …"
            autoFocus
          />
        )}
      </Field>
      <Field label="Статус">
        {(p) => (
          <Select {...p} value={status} onChange={(e) => setStatus(e.currentTarget.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
