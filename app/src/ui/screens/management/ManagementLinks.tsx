import { useEffect } from 'preact/hooks';
import { toast } from '@/state/ui';
import { managementRepo } from '@/infra/repos/management';
import { routes } from '@/app/routes';
import { managementEvents } from '@/domain/management';
import { signalDefinitions } from '@/data/management';
import { ManagementBadge } from './ManagementScreen';
export function ManagementLinks({ teamId, employeeId }: { teamId?: string; employeeId?: string }) {
  const s = managementRepo.signal.value;
  useEffect(() => {
    void managementRepo
      .load()
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : String(error)),
      );
  }, []);
  const actions = s.actions.filter((x) =>
      employeeId ? x.employeeId === employeeId : x.teamId === teamId,
    ),
    people = s.people.filter((x) =>
      employeeId ? x.employeeId === employeeId : x.teamId === teamId,
    ),
    signals = teamId ? s.signals.filter((x) => x.teamId === teamId) : [],
    observations = s.observations.filter((x) =>
      teamId ? x.teamId === teamId : x.employeeId === employeeId,
    );
  const suffix = teamId
    ? '&team=' + encodeURIComponent(teamId)
    : '&employee=' + encodeURIComponent(employeeId ?? '');
  return (
    <details class="mos-panel space-y-3">
      <summary class="cursor-pointer text-sm font-medium">
        Управленческий контекст ·{' '}
        {actions.length + signals.length + people.length + observations.length}
      </summary>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Обязательства и сигналы</h3>
        <a class="text-sm text-blue-300" href={routes.management.path + '?area=actions' + suffix}>
          Открыть Реестр →
        </a>
      </div>
      {actions.length ? (
        actions.map((x) => (
          <a
            class="flex items-center justify-between gap-3 border-t border-white/5 py-3 text-sm"
            key={x.id}
            href={
              routes.management.path +
              '?area=actions' +
              suffix +
              '&record=' +
              encodeURIComponent(x.id)
            }
          >
            <span>
              {x.title} · {x.due}
            </span>
            <ManagementBadge value={x.status} />
          </a>
        ))
      ) : (
        <p class="text-sm text-slate-500">Связанных управленческих действий пока нет.</p>
      )}
      {signals.length > 0 && (
        <div class="flex flex-wrap gap-3">
          {signals.map((x) => (
            <a
              key={x.id}
              href={
                routes.management.path +
                '?area=signals' +
                suffix +
                '&record=' +
                encodeURIComponent(x.id)
              }
              class="text-xs text-slate-400"
            >
              {signalDefinitions.find((d) => d.key === x.signal)?.label}{' '}
              <ManagementBadge value={x.level} />
            </a>
          ))}
        </div>
      )}
      {people.length > 0 && (
        <a
          class="block text-sm text-blue-300"
          href={routes.management.path + '?area=people' + suffix}
        >
          People Loop · исключений: {people.length} →
        </a>
      )}
      {observations.length > 0 && (
        <div class="border-t border-white/10 pt-3">
          <h4 class="text-sm font-medium">Наблюдения о DPO и лидах</h4>
          {observations.slice(-3).map((x) => (
            <a
              key={x.id}
              class="mt-2 block text-sm text-slate-400"
              href={
                routes.management.path +
                '?area=observations' +
                suffix +
                '&record=' +
                encodeURIComponent(x.id)
              }
            >
              {x.date} · {x.signal} · {x.note}
            </a>
          ))}
        </div>
      )}
    </details>
  );
}
export function ManagementCalendar({ year, month }: { year: number; month: number }) {
  const s = managementRepo.signal.value;
  useEffect(() => {
    void managementRepo
      .load()
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : String(error)),
      );
  }, []);
  const events = managementEvents(s, year, month);
  return (
    <section class="mos-panel">
      <h3 class="mb-3 font-semibold">Management OS · Сроки и квартальные проверки</h3>
      {events.length ? (
        events.map((x) => (
          <a
            class="flex gap-4 border-t border-white/5 py-3 text-sm"
            key={x.id}
            href={routes.management.path + '?area=' + x.area}
          >
            <time class="shrink-0 text-slate-500 tabular-nums">{x.date}</time>
            <span class="text-blue-200">{x.label}</span>
          </a>
        ))
      ) : (
        <p class="text-sm text-slate-500">На этот месяц управленческие даты не заданы.</p>
      )}
    </section>
  );
}
