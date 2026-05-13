import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { DevelopmentItem, Employee, TeamHistoryItem } from '@/data/schema';
import { employeesRepo } from '@/infra/repos';
import { toast } from '@/state/ui';
import { Button } from '@/ui/components/Button';
import { Field, Select, TextInput } from '@/ui/components/Field';

/**
 * Вкладка «Дополнительно». На этом этапе собирает:
 *  - ИПР (development[]): список зон развития со статусом и дедлайном;
 *  - История смены команд (teamHistory[]).
 *
 * Прочие списки из легаси (managerComments, documents, salaryHistory) пока
 * не отображаются — следующий этап.
 */
const DEV_STATUSES = ['не начато', 'в работе', 'выполнено'] as const;

export function ExtraTab({ employee }: { employee: Employee }): JSX.Element {
  const [development, setDevelopment] = useState<DevelopmentItem[]>(employee.development);
  const [teamHistory, setTeamHistory] = useState<TeamHistoryItem[]>(employee.teamHistory);
  const [dirty, setDirty] = useState(false);

  function markDirty(): void {
    setDirty(true);
  }

  // ---- ИПР ----
  function updateDev(idx: number, patch: Partial<DevelopmentItem>): void {
    setDevelopment((arr) => arr.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
    markDirty();
  }
  function addDev(): void {
    setDevelopment((arr) => [...arr, { zone: '', status: 'не начато', deadline: '' }]);
    markDirty();
  }
  function removeDev(idx: number): void {
    setDevelopment((arr) => arr.filter((_, i) => i !== idx));
    markDirty();
  }

  // ---- История команд ----
  function updateTeam(idx: number, patch: Partial<TeamHistoryItem>): void {
    setTeamHistory((arr) => arr.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
    markDirty();
  }
  function addTeam(): void {
    setTeamHistory((arr) => [
      { date: new Date().toISOString().slice(0, 10), from: '', to: '', comment: '' },
      ...arr,
    ]);
    markDirty();
  }
  function removeTeam(idx: number): void {
    setTeamHistory((arr) => arr.filter((_, i) => i !== idx));
    markDirty();
  }

  function handleSave(e: Event): void {
    e.preventDefault();
    const cleanedDev = development
      .map((d) => ({ ...d, zone: d.zone.trim() }))
      .filter((d) => d.zone.length > 0);
    const cleanedTeam = teamHistory
      .map((h) => ({
        ...h,
        from: h.from.trim(),
        to: h.to.trim(),
        comment: h.comment.trim(),
      }))
      .filter((h) => h.date || h.from || h.to || h.comment);
    employeesRepo.update(employee.id, {
      development: cleanedDev,
      teamHistory: cleanedTeam,
    });
    setDevelopment(cleanedDev);
    setTeamHistory(cleanedTeam);
    setDirty(false);
    toast.success('Дополнительные данные сохранены');
  }
  function handleReset(): void {
    setDevelopment(employee.development);
    setTeamHistory(employee.teamHistory);
    setDirty(false);
  }

  const devDone = development.filter((d) => d.status === 'выполнено').length;

  return (
    <form onSubmit={handleSave} class="space-y-6">
      <section class="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <header class="flex items-center justify-between">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Индивидуальный план развития
          </h3>
          <span class="text-xs text-slate-500">
            {development.length === 0
              ? 'не заполнен'
              : `${devDone}/${development.length} выполнено`}
          </span>
        </header>

        {development.length === 0 && (
          <p class="text-sm text-slate-500">
            Зон развития пока нет. Добавьте первую — например, «System Design» с дедлайном к концу квартала.
          </p>
        )}

        <ul class="space-y-3">
          {development.map((d, i) => (
            <li
              key={i}
              class="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_180px_160px_auto]"
            >
              <Field label="Зона развития">
                {(p) => (
                  <TextInput
                    {...p}
                    value={d.zone}
                    onInput={(e) => updateDev(i, { zone: e.currentTarget.value })}
                    placeholder="System Design, доменная экспертиза…"
                  />
                )}
              </Field>
              <Field label="Статус">
                {(p) => (
                  <Select
                    {...p}
                    value={d.status || 'не начато'}
                    onChange={(e) => updateDev(i, { status: e.currentTarget.value })}
                  >
                    {DEV_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Дедлайн">
                {(p) => (
                  <TextInput
                    {...p}
                    type="date"
                    value={d.deadline}
                    onInput={(e) => updateDev(i, { deadline: e.currentTarget.value })}
                  />
                )}
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeDev(i)}
                aria-label="Удалить зону развития"
              >
                ×
              </Button>
            </li>
          ))}
        </ul>

        <Button type="button" variant="secondary" size="sm" onClick={addDev}>
          + Добавить зону
        </Button>
      </section>

      <section class="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <header class="flex items-center justify-between">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">
            История смены команд
          </h3>
          <Button type="button" variant="secondary" size="sm" onClick={addTeam}>
            + Добавить
          </Button>
        </header>

        {teamHistory.length === 0 && (
          <p class="text-sm text-slate-500">История пуста.</p>
        )}

        {teamHistory.length > 0 && (
          <div class="overflow-hidden rounded-xl border border-white/10">
            <table class="w-full text-sm">
              <thead class="bg-white/5 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th class="px-3 py-2 font-medium">Дата</th>
                  <th class="px-3 py-2 font-medium">Из команды</th>
                  <th class="px-3 py-2 font-medium">В команду</th>
                  <th class="px-3 py-2 font-medium">Комментарий</th>
                  <th class="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {teamHistory.map((h, i) => (
                  <tr key={i} class="border-t border-white/5">
                    <td class="px-3 py-2">
                      <TextInput
                        type="date"
                        value={h.date}
                        onInput={(e) => updateTeam(i, { date: e.currentTarget.value })}
                      />
                    </td>
                    <td class="px-3 py-2">
                      <TextInput
                        value={h.from}
                        onInput={(e) => updateTeam(i, { from: e.currentTarget.value })}
                      />
                    </td>
                    <td class="px-3 py-2">
                      <TextInput
                        value={h.to}
                        onInput={(e) => updateTeam(i, { to: e.currentTarget.value })}
                      />
                    </td>
                    <td class="px-3 py-2">
                      <TextInput
                        value={h.comment}
                        onInput={(e) => updateTeam(i, { comment: e.currentTarget.value })}
                      />
                    </td>
                    <td class="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTeam(i)}
                        aria-label="Удалить"
                      >
                        ×
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer class="sticky bottom-0 -mx-2 flex items-center justify-end gap-2 border-t border-white/10 bg-slate-950/80 px-2 py-3 backdrop-blur">
        {dirty && <span class="mr-auto text-sm text-amber-300">Есть несохранённые изменения</span>}
        <Button type="button" variant="secondary" onClick={handleReset} disabled={!dirty}>
          Отменить
        </Button>
        <Button type="submit" disabled={!dirty}>
          Сохранить
        </Button>
      </footer>
    </form>
  );
}
