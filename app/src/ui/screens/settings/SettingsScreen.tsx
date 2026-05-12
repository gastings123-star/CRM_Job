import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { Button } from '@/ui/components/Button';
import { toast } from '@/state/ui';
import {
  migrateLegacy,
  readLegacyFromJson,
  type LegacySource,
  type MigrationReport,
} from '@/infra/migrate-legacy';

/**
 * Экран `/settings`. Пока единственный блок — импорт данных из legacy
 * приложения: localStorage текущего origin или JSON-бэкап.
 *
 * Поток:
 *  1) пользователь выбирает источник (localStorage / JSON);
 *  2) жмёт «Предпросмотр» — `dryRun: true`, видит план (сколько найдём,
 *     сколько пропустим, ошибки валидации);
 *  3) если план устраивает — «Применить» вызывает миграцию `dryRun: false`,
 *     записи проходят через репо → SyncQueue → Supabase.
 */
export function SettingsScreen(): JSX.Element {
  const [source, setSource] = useState<LegacySource | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>('');
  const [report, setReport] = useState<MigrationReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function previewFromLocalStorage(): void {
    setSource(undefined as unknown as LegacySource); // используем стандартный источник
    setSourceLabel('localStorage этого браузера');
    const r = migrateLegacy({ dryRun: true });
    setReport(r);
    if (r.employees.found === 0 && r.teams.found === 0) {
      toast.warn('В localStorage этого браузера legacy-данных не найдено');
    } else {
      toast.info('План построен — проверьте и нажмите «Применить»');
    }
    // Сохраняем «реальный» источник, чтобы apply прочёл его снова.
    setSource(null); // null = читать из localStorage
  }

  async function previewFromFile(file: File): Promise<void> {
    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch (e) {
      toast.error(`Не удалось разобрать JSON: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const src = readLegacyFromJson(parsed);
    setSource(src);
    setSourceLabel(`файл «${file.name}»`);
    const r = migrateLegacy({ dryRun: true, source: src });
    setReport(r);
    if (r.employees.found === 0 && r.teams.found === 0) {
      toast.warn('В файле legacy-данных не найдено');
    } else {
      toast.info('План построен — проверьте и нажмите «Применить»');
    }
  }

  function applyImport(): void {
    if (!report) return;
    const r = source
      ? migrateLegacy({ dryRun: false, source })
      : migrateLegacy({ dryRun: false });
    setReport(r);
    const total = r.employees.toImport + r.teams.toImport;
    if (total === 0) {
      toast.warn('Импортировать нечего — план был пуст');
    } else {
      toast.success(
        `Импортировано: сотрудников ${r.employees.toImport}, команд ${r.teams.toImport}`,
      );
    }
  }

  return (
    <div class="space-y-6">
      <header>
        <h2 class="text-2xl font-semibold">Настройки</h2>
        <p class="mt-1 text-sm text-slate-400">
          Перенос данных из старой версии Staff CRM.
        </p>
      </header>

      <section class="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
        <h3 class="text-lg font-semibold">Импорт данных</h3>
        <p class="text-sm text-slate-400">
          Источник — localStorage этого браузера (ключи <code>staff_crm_v1</code>,{' '}
          <code>staff_crm_teams_v1</code>) или JSON-бэкап старого приложения.
          Импорт идемпотентен: повторный запуск пропускает уже перенесённые записи
          по сохранённому <code>legacyId</code>.
        </p>

        <div class="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={previewFromLocalStorage}>
            Предпросмотр из localStorage
          </Button>
          <Button
            variant="secondary"
            onClick={() => fileRef.current?.click()}
          >
            Выбрать JSON-файл…
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            class="hidden"
            onChange={(e) => {
              const input = e.currentTarget;
              const f = input.files?.[0];
              if (f) void previewFromFile(f);
              input.value = '';
            }}
          />
          <Button
            onClick={applyImport}
            disabled={
              !report ||
              report.dryRun === false ||
              report.employees.toImport + report.teams.toImport === 0
            }
          >
            Применить ({(report?.employees.toImport ?? 0) + (report?.teams.toImport ?? 0)})
          </Button>
        </div>

        {report && <ReportView report={report} sourceLabel={sourceLabel} />}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------
// Отображение отчёта
// ---------------------------------------------------------------

function ReportView({
  report,
  sourceLabel,
}: {
  report: MigrationReport;
  sourceLabel: string;
}): JSX.Element {
  return (
    <div class="space-y-4 rounded-xl border border-white/10 bg-slate-950/40 p-4">
      <div class="flex items-center gap-3">
        <span
          class={`rounded-full px-2.5 py-0.5 text-xs ${
            report.dryRun
              ? 'bg-blue-500/20 text-blue-300'
              : 'bg-emerald-500/20 text-emerald-300'
          }`}
        >
          {report.dryRun ? 'Предпросмотр' : 'Применено'}
        </span>
        <span class="text-sm text-slate-400">Источник: {sourceLabel || '—'}</span>
      </div>

      <Section title="Сотрудники" stats={report.employees} />
      <Section title="Команды" stats={report.teams} />
    </div>
  );
}

function Section({
  title,
  stats,
}: {
  title: string;
  stats: MigrationReport['employees'];
}): JSX.Element {
  return (
    <div>
      <h4 class="text-sm font-semibold text-slate-200">{title}</h4>
      <dl class="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-300 sm:grid-cols-4">
        <Cell label="найдено" value={stats.found} />
        <Cell label="к импорту" value={stats.toImport} />
        <Cell label="уже есть" value={stats.skippedExisting} />
        <Cell label="битые" value={stats.skippedInvalid} />
      </dl>
      {stats.errors.length > 0 && (
        <details class="mt-2 text-xs text-slate-400">
          <summary class="cursor-pointer text-slate-300">
            Ошибки валидации ({stats.errors.length})
          </summary>
          <ul class="mt-1 list-disc space-y-0.5 pl-5">
            {stats.errors.slice(0, 10).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {stats.errors.length > 10 && <li>…ещё {stats.errors.length - 10}</li>}
          </ul>
        </details>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div class="flex items-baseline gap-1">
      <span class="text-slate-500">{label}:</span>
      <span class="font-semibold text-slate-100">{value}</span>
    </div>
  );
}
