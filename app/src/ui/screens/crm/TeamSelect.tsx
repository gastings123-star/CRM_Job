import { useEffect, useState } from 'preact/hooks';
import { teamsRepo } from '@/infra/repos';
import { Field, Select } from '@/ui/components/Field';

export function TeamSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const teams = teamsRepo.signal.value;
  const [error, setError] = useState(false);
  useEffect(() => {
    void teamsRepo.loadAll().catch(() => setError(true));
  }, []);
  return (
    <Field
      label="Команда"
      hint={
        error
          ? 'Не удалось обновить список команд. Текущее значение сохранено.'
          : 'Команды из раздела «Команды»'
      }
    >
      {(p) => (
        <Select {...p} value={value} onChange={(e) => onChange(e.currentTarget.value)}>
          <option value="">Без команды</option>
          {value && !teams.some((t) => t.name === value) && (
            <option value={value}>{value} (текущее значение)</option>
          )}
          {teams.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
