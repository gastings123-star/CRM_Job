import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import type { Employee } from '@/data/schema';
import type { ManagementState } from '@/data/management';
import { crmWeek, dueGuide, guideNow, type GuideTarget } from '@/domain/management-guide';
import { routes, employeeUrl } from '@/app/routes';
import { managementRepo } from '@/infra/repos/management';

function href(target: GuideTarget) {
  if (target.employeeId) return employeeUrl(target.employeeId) + '?tab=' + (target.tab ?? 'basic');
  return routes[target.route].path + (target.area ? '?area=' + target.area : '');
}
function GuideLink({ target, label }: { target: GuideTarget; label: string }) {
  return (
    <a
      class="inline-block rounded-lg border border-white/10 px-3 py-2 text-sm text-blue-200 hover:bg-white/5"
      href={href(target)}
    >
      {label} →
    </a>
  );
}
export function WorkGuide({
  state,
  employees,
  personal,
  now,
}: {
  state: ManagementState;
  employees: Employee[];
  personal: unknown;
  now: Date;
}) {
  const guide = useMemo(() => guideNow(state, now), [state, now]);
  const items = useMemo(
    () => dueGuide(state, employees, personal, now),
    [state, employees, personal, now],
  );
  const renderItem = (item: (typeof items)[number]) => (
    <a
      key={item.id}
      href={href(item.target)}
      class="block border-t border-white/10 py-3 hover:text-blue-200"
    >
      <span class="block text-sm">{item.title}</span>
      <span class="mt-1 block text-xs text-slate-400">{item.reason} · открыть источник →</span>
    </a>
  );
  return (
    <section class="mos-panel !border-blue-400/20 !bg-slate-900" aria-label="Что делать сейчас">
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          Сейчас · {now.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })} · время
          вашего ПК
        </span>
        <span>
          {now.toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>
      <h3 class="mt-3 text-xl font-semibold">{guide.label}</h3>
      <p class="mt-2 text-sm leading-6 text-slate-300">
        {guide.current?.detail ??
          'Отдельного обязательного управленческого блока сейчас нет. Ориентируйтесь на назначенные встречи и сроки ниже.'}
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        {guide.current ? (
          guide.current.links.map((link) => <GuideLink key={link.label} {...link} />)
        ) : (
          <GuideLink target={{ route: 'calendar' }} label="Календарь CRM" />
        )}
      </div>
      <p class="mt-4 text-xs leading-5 text-slate-400">
        Далее: {guide.nextDate} · {guide.next.time} · {guide.next.title}
      </p>
      <details class="mt-4 border-t border-white/10 pt-3">
        <summary class="cursor-pointer text-sm text-slate-300">Распорядок сегодня</summary>
        <div class="mt-3 space-y-3">
          {guide.slots.length ? (
            guide.slots.map((slot) => (
              <div key={slot.start} class="text-sm">
                <p class={slot === guide.current ? 'text-blue-200' : 'text-slate-300'}>
                  {slot.time} · {slot.title}
                </p>
                <p class="mt-1 text-xs text-slate-400">{slot.detail}</p>
              </div>
            ))
          ) : (
            <p class="text-sm text-slate-400">В выходные регулярные блоки не назначаются.</p>
          )}
        </div>
      </details>
      <div class="mt-5">
        <h4 class="mb-2 text-sm font-medium">Сроки и встречи · Management OS + CRM</h4>
        {items.slice(0, 4).map(renderItem)}
        {items.length > 4 && (
          <details>
            <summary class="cursor-pointer py-2 text-sm text-blue-200">
              Ещё {items.length - 4}
            </summary>
            {items.slice(4).map(renderItem)}
          </details>
        )}
        {!items.length && (
          <p class="text-sm text-slate-400">
            По сохранённым данным нет просроченных записей и сроков на сегодня или завтра.
          </p>
        )}
        <p class="mt-2 text-xs leading-5 text-slate-500">
          Подсказки не создают задач. Встречи показаны по датам из CRM; точное время в карточках не
          хранится.
        </p>
      </div>
    </section>
  );
}
export function CrmRhythm() {
  return (
    <section class="mos-panel">
      <h3 class="text-lg font-semibold">Staff CRM внутри общего ритма</h3>
      <p class="mt-2 text-sm leading-6 text-slate-400">
        Работа с CRM входит в существующие блоки 09:25–11:00. Обновляйте записи по факту изменений,
        а не ради отчёта. Встречи 1-on-1 проводятся в назначенные даты, независимо от темы дня.
      </p>
      <div class="mt-4 space-y-4">
        {crmWeek.map((day) => (
          <div key={day.day} class="border-t border-white/10 pt-3">
            <h4 class="text-sm font-medium">
              {day.day} · {day.title}
            </h4>
            <p class="my-2 text-sm leading-6 text-slate-400">{day.detail}</p>
            <div class="flex flex-wrap gap-2">
              {day.links.map((link) => (
                <GuideLink key={link.label} {...link} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p class="mt-4 text-xs leading-5 text-slate-400">
        Сотрудники, 1-on-1, ИПР и задачи остаются в CRM. Реестр хранит отдельные действия личного
        контроля. Пульс — источник фактов, Scorecard — управленческая оценка; цвета не переносятся
        автоматически.
      </p>
    </section>
  );
}
export function WorkGuideRibbon() {
  const loc = useLocation();
  const state = managementRepo.signal.value;
  const [now, setNow] = useState(() => new Date());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void managementRepo.load().catch(() => setFailed(true));
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 30000);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, []);
  const guide = useMemo(() => guideNow(state, now), [state, now]);
  if (loc.path === routes.management.path) return null;
  return (
    <a
      href={routes.management.path + '?area=cockpit'}
      class="mb-5 block rounded-xl border border-blue-400/20 bg-blue-500/5 px-4 py-3 text-sm text-slate-300"
    >
      {failed ? 'Не удалось обновить ритм — открыть Cockpit' : `Сейчас: ${guide.label}`}
      <span class="ml-2 text-blue-200">К подсказкам дня →</span>
    </a>
  );
}
