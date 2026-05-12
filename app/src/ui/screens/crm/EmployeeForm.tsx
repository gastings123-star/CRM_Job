import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Field, Select, TextInput } from '@/ui/components/Field';
import { Button } from '@/ui/components/Button';
import type { Employee } from '@/data/schema';

const GRADES = ['Junior', 'Middle', 'Senior', 'Lead'] as const;

export interface EmployeeFormValues {
  fullName: string;
  role: string;
  grade: string;
  hireDate: string;
  email: string;
  salary: number;
}

export interface EmployeeFormErrors {
  fullName?: string;
}

function fromEmployee(e: Employee | null): EmployeeFormValues {
  if (!e) {
    return { fullName: '', role: '', grade: 'Junior', hireDate: '', email: '', salary: 0 };
  }
  return {
    fullName: e.fullName,
    role: e.role,
    grade: e.grade,
    hireDate: e.hireDate,
    email: e.email,
    salary: e.salary,
  };
}

export interface EmployeeFormProps {
  initial?: Employee | null;
  onSubmit: (values: EmployeeFormValues) => void;
  onCancel: () => void;
  submitLabel?: string;
}

/**
 * Унифицированная форма создания / редактирования сотрудника.
 * Валидация минимальная (только обязательность ФИО) — остальное берёт Zod.
 */
export function EmployeeForm({
  initial = null,
  onSubmit,
  onCancel,
  submitLabel = 'Сохранить',
}: EmployeeFormProps): JSX.Element {
  const [values, setValues] = useState<EmployeeFormValues>(fromEmployee(initial));
  const [errors, setErrors] = useState<EmployeeFormErrors>({});

  function patch<K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]): void {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(e: Event): void {
    e.preventDefault();
    const nextErrors: EmployeeFormErrors = {};
    if (!values.fullName.trim()) nextErrors.fullName = 'Обязательное поле';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit({ ...values, fullName: values.fullName.trim() });
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-4">
      <Field label="ФИО" required error={errors.fullName}>
        {(p) => (
          <TextInput
            {...p}
            value={values.fullName}
            onInput={(e) => patch('fullName', (e.currentTarget).value)}
            placeholder="Иван Иванов"
            autoFocus
          />
        )}
      </Field>

      <div class="grid grid-cols-2 gap-4">
        <Field label="Должность">
          {(p) => (
            <TextInput
              {...p}
              value={values.role}
              onInput={(e) => patch('role', (e.currentTarget).value)}
              placeholder="Frontend-разработчик"
            />
          )}
        </Field>
        <Field label="Грейд">
          {(p) => (
            <Select
              {...p}
              value={values.grade}
              onChange={(e) => patch('grade', (e.currentTarget).value)}
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <Field label="Дата найма">
          {(p) => (
            <TextInput
              {...p}
              type="date"
              value={values.hireDate}
              onInput={(e) => patch('hireDate', (e.currentTarget).value)}
            />
          )}
        </Field>
        <Field label="Email">
          {(p) => (
            <TextInput
              {...p}
              type="email"
              value={values.email}
              onInput={(e) => patch('email', (e.currentTarget).value)}
              placeholder="user@example.com"
            />
          )}
        </Field>
      </div>

      <Field label="Зарплата (₽/мес)" hint="0 — если не указано">
        {(p) => (
          <TextInput
            {...p}
            type="number"
            min={0}
            step={1000}
            value={values.salary}
            onInput={(e) => {
              const n = Number((e.currentTarget).value);
              patch('salary', Number.isFinite(n) ? n : 0);
            }}
          />
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
