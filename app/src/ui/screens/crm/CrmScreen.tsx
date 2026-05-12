import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { EmployeeSchema, type Employee } from '@/data/schema';
import { employeesRepo } from '@/infra/repos';
import { Button } from '@/ui/components/Button';
import { Modal } from '@/ui/components/Modal';
import { TextInput } from '@/ui/components/Field';
import { confirm, toast } from '@/state/ui';
import { EmployeeForm, type EmployeeFormValues } from './EmployeeForm';

/**
 * Экран `/crm` — список сотрудников + CRUD через модалки.
 * Источник данных: `employeesRepo` (signal). При монтировании пробуем
 * подтянуть свежие данные с сервера; ошибки только тостом — UI остаётся
 * работоспособным с локальным кэшем.
 */
export function CrmScreen(): JSX.Element {
  const employees = employeesRepo.signal.value;
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(false);

  // Одна загрузка при первом монтировании экрана.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    employeesRepo
      .loadAll()
      .catch((e: unknown) => {
        if (cancelled) return;
        toast.error(
          `Не удалось загрузить сотрудников: ${e instanceof Error ? e.message : String(e)}`,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        e.role.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q),
    );
  }, [employees, query]);

  function handleCreate(values: EmployeeFormValues): void {
    const draft = makeEmployee(values);
    const parsed = EmployeeSchema.safeParse(draft);
    if (!parsed.success) {
      const summary = parsed.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
      console.error('EmployeeSchema validation failed:', parsed.error.issues);
      toast.error(`Не удалось сохранить: ${summary || 'данные не прошли валидацию'}`);
      return;
    }
    employeesRepo.create(parsed.data);
    toast.success('Сотрудник добавлен');
    setCreateOpen(false);
  }

  function handleEdit(values: EmployeeFormValues): void {
    if (!editing) return;
    const patch: Partial<Employee> = {
      fullName: values.fullName,
      role: values.role,
      grade: values.grade,
      hireDate: values.hireDate,
      email: values.email,
      salary: values.salary,
    };
    employeesRepo.update(editing.id, patch);
    toast.success('Изменения сохранены');
    setEditing(null);
  }

  async function handleDelete(e: Employee): Promise<void> {
    const ok = await confirm({
      title: 'Удалить сотрудника?',
      body: `${e.fullName || 'Без имени'} будет удалён без возможности восстановления.`,
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    employeesRepo.remove(e.id);
    toast.success('Сотрудник удалён');
  }

  return (
    <div class="space-y-6">
      <header class="flex flex-wrap items-center gap-3">
        <h2 class="text-2xl font-semibold">CRM — сотрудники</h2>
        <span class="text-sm text-slate-400">
          {employees.length === 0 ? 'нет записей' : `${employees.length} в базе`}
        </span>
        <div class="ml-auto flex items-center gap-2">
          <TextInput
            value={query}
            onInput={(e) => setQuery((e.currentTarget).value)}
            placeholder="Поиск по имени / роли / email"
            class="!w-72"
          />
          <Button onClick={() => setCreateOpen(true)}>+ Добавить</Button>
        </div>
      </header>

      {loading && employees.length === 0 ? (
        <div class="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
          Загружаем…
        </div>
      ) : employees.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <EmployeesTable
          rows={filtered}
          totalQuery={query}
          onEdit={setEditing}
          onDelete={(e) => void handleDelete(e)}
        />
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Новый сотрудник"
        maxWidth="lg"
      >
        <EmployeeForm
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
          submitLabel="Добавить"
        />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Редактирование: ${editing.fullName || 'Без имени'}` : ''}
        maxWidth="lg"
      >
        <EmployeeForm
          initial={editing}
          onSubmit={handleEdit}
          onCancel={() => setEditing(null)}
        />
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------
// Подкомпоненты
// ---------------------------------------------------------------

function EmptyState({ onCreate }: { onCreate: () => void }): JSX.Element {
  return (
    <div class="rounded-2xl border border-dashed border-white/10 bg-white/5 p-10 text-center">
      <p class="text-lg text-slate-200">Пока ни одного сотрудника</p>
      <p class="mt-1 text-sm text-slate-400">
        Добавьте первого — данные синхронизируются автоматически.
      </p>
      <div class="mt-4">
        <Button onClick={onCreate}>+ Добавить сотрудника</Button>
      </div>
    </div>
  );
}

interface EmployeesTableProps {
  rows: Employee[];
  totalQuery: string;
  onEdit: (e: Employee) => void;
  onDelete: (e: Employee) => void;
}

function EmployeesTable({ rows, totalQuery, onEdit, onDelete }: EmployeesTableProps): JSX.Element {
  if (rows.length === 0) {
    return (
      <div class="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-slate-400">
        По запросу «{totalQuery}» ничего не найдено
      </div>
    );
  }
  return (
    <div class="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <table class="w-full text-sm">
        <thead class="bg-white/5 text-left text-xs uppercase text-slate-400">
          <tr>
            <th class="px-4 py-3 font-medium">ФИО</th>
            <th class="px-4 py-3 font-medium">Должность</th>
            <th class="px-4 py-3 font-medium">Грейд</th>
            <th class="px-4 py-3 font-medium">Дата найма</th>
            <th class="px-4 py-3 font-medium">Email</th>
            <th class="px-4 py-3 text-right font-medium">Действия</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} class="border-t border-white/5 hover:bg-white/5">
              <td class="px-4 py-2.5">
                <button
                  type="button"
                  class="text-left text-blue-300 hover:text-blue-200 hover:underline"
                  onClick={() => onEdit(e)}
                >
                  {e.fullName || <span class="text-slate-500">— без имени —</span>}
                </button>
              </td>
              <td class="px-4 py-2.5 text-slate-300">{e.role || '—'}</td>
              <td class="px-4 py-2.5 text-slate-300">{e.grade}</td>
              <td class="px-4 py-2.5 text-slate-300">{e.hireDate || '—'}</td>
              <td class="px-4 py-2.5 text-slate-300">{e.email || '—'}</td>
              <td class="px-4 py-2.5 text-right">
                <Button size="sm" variant="ghost" onClick={() => onEdit(e)}>
                  Редактировать
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(e)}>
                  Удалить
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------
// Конструктор Employee из формы — пустые поля + значения из формы.
// Остальные поля заполнятся дефолтами Zod при .parse().
// ---------------------------------------------------------------

function makeEmployee(v: EmployeeFormValues): unknown {
  // `load` обязателен в Zod-схеме (без `.default()` на корне),
  // поэтому передаём пустой объект — внутренние поля заполнятся дефолтами.
  return {
    id: crypto.randomUUID(),
    fullName: v.fullName,
    role: v.role,
    grade: v.grade,
    hireDate: v.hireDate,
    email: v.email,
    salary: v.salary,
    load: {},
  };
}
