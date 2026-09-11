import { useState } from 'preact/hooks';
import { Button } from '@/ui/components/Button';
import { confirm } from '@/state/ui';
import { syncQueue } from '@/infra/sync';
export function LocalBackup() {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function restore(file: File) {
    setError('');
    setBusy(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Файл больше 20 МБ');
      const backup = JSON.parse(await file.text()) as {
        format?: string;
        tables?: Record<string, unknown[]>;
      };
      if (backup.format !== 'staff-crm-local-v1')
        throw new Error(
          'Выберите полную локальную копию Staff CRM. Старый формат импортируется в разделе ниже.',
        );
      await syncQueue.flush();
      if (syncQueue.getOps().length) throw new Error('Сначала дождитесь сохранения всех изменений');
      const current = (await (await fetch('/local-api/backup')).json()) as { revision: number };
      if (
        !(await confirm({
          title: 'Восстановить локальные данные?',
          body: `Будут заменены все локальные данные CRM и Management OS. В копии ${backup.tables?.employees?.length ?? 0} сотрудников. Текущее состояние сохранится в автоматической копии.`,
          danger: true,
          confirmLabel: 'Восстановить',
        }))
      )
        return;
      const r = await fetch('/local-api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: current.revision, backup }),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error: string }).error);
      for (const key of Object.keys(localStorage))
        if (key.startsWith('crm-local:')) localStorage.removeItem(key);
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="mos-panel space-y-4">
      <h3 class="text-lg font-semibold">Локальные данные и резервные копии</h3>
      <p class="text-sm text-slate-400">
        CRM и Management OS сохраняются на этом ПК в app/.local-data/staff-crm.json. Хранятся 30
        предыдущих версий. Облачная синхронизация отключена.
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <Button
          disabled={busy}
          onClick={async () => {
            try {
              await syncQueue.flush();
              if (syncQueue.getOps().length) throw new Error('Есть несохранённые изменения');
              location.href = '/local-api/backup';
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Скачать полную копию
        </Button>
        <label class="text-sm">
          Восстановить JSON
          <input
            disabled={busy}
            class="ml-3 max-w-64 text-sm"
            type="file"
            accept=".json"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void restore(f);
              e.currentTarget.value = '';
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" class="text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
