import { useWorkspaceBack } from '@/ui/hooks/useWorkspaceBack';
import { DayStart } from './DayStart';
import { MeetingSummary } from './MeetingSummary';
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { routes, employeeUrl } from '@/app/routes';
import { employeesRepo, teamsRepo, personalRepo, projectsRepo } from '@/infra/repos';
import { managementRepo } from '@/infra/repos/management';
import { getSession } from '@/infra/auth';
import { syncQueue } from '@/infra/sync';
import { iso } from '@/domain/management';
import {
  deskItems,
  activeDeskFocus,
  focusKey,
  withStableWorkIds,
  type DeskItem,
} from '@/domain/workdesk';
import { guideNow, type GuideTarget } from '@/domain/management-guide';
import { Button } from '@/ui/components/Button';
import { Modal } from '@/ui/components/Modal';
import { openCommandPalette } from '@/state/command-palette';

export function deskHref(target: GuideTarget & { recordId?: string }) {
  if (target.employeeId) return employeeUrl(target.employeeId) + '?tab=' + (target.tab ?? 'basic');
  const params = new URLSearchParams();
  if (target.area) params.set('area', target.area);
  if (target.recordId) params.set('record', target.recordId);
  return routes[target.route].path + (params.size ? '?' + params.toString() : '');
}
export function WorkDesk({ children }: { children: ComponentChildren }) {
  const loc = useLocation();
  const back = useWorkspaceBack();
  const workflow = new URLSearchParams(loc.url.split('?')[1] ?? '').get('workflow');
  const startWorkflow = (name: string) => loc.route(routes.dashboard.path + '?workflow=' + name);
  const state = managementRepo.signal.value,
    employees = employeesRepo.signal.value,
    teams = teamsRepo.signal.value,
    personal = personalRepo.signal.value;
  const [now, setNow] = useState(() => new Date());
  const [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [picker, setPicker] = useState(false),
    [search, setSearch] = useState('');
  const queryArea = new URLSearchParams(loc.url.split('?')[1] ?? '').get('area');
  const home =
    loc.path === routes.dashboard.path ||
    (loc.path === routes.management.path && (!queryArea || queryArea === 'cockpit'));
  const items = useMemo(
    () => deskItems(state, employees, teams, personal, now),
    [state, employees, teams, personal, now],
  );
  const focus = useMemo(() => activeDeskFocus(state, items, now), [state, items, now]);
  const queue = items.filter((i) => i.attention && !focus.some((f) => f.key === i.key));
  const guide = useMemo(() => guideNow(state, now), [state, now]);
  const closePicker = useCallback(() => setPicker(false), []);
  const load = useCallback(async () => {
    setError('');
    try {
      const session = await getSession();
      await Promise.all([
        managementRepo.load(),
        employeesRepo.loadAll(),
        teamsRepo.loadAll(),
        projectsRepo.loadAll(),
        ...(session ? [personalRepo.loadFor(session.user.id)] : []),
      ]);
      for (const employee of employeesRepo.getAll()) {
        const upgraded = withStableWorkIds(employee, () => crypto.randomUUID());
        if (upgraded !== employee)
          employeesRepo.update(employee.id, {
            tasks: upgraded.tasks,
            development: upgraded.development,
          });
      }
      await syncQueue.flush();
      if (syncQueue.getStatus().pending)
        throw new Error('Есть несохранённые изменения. Повторите обновление после сохранения.');
      setLoaded(true);
    } catch (e) {
      setError(`Не удалось обновить рабочий стол: ${String(e)}`);
    }
  }, []);
  useEffect(() => {
    void load();
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 30000);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, [load]);
  const open = (target: GuideTarget & { recordId?: string }) => loc.route(deskHref(target));
  async function toggleFocus(item: DeskItem) {
    if (busy || !item.ref) return;
    setBusy(true);
    setError('');
    try {
      const current = managementRepo.signal.value;
      const currentItems = deskItems(
        current,
        employeesRepo.signal.value,
        teamsRepo.signal.value,
        personalRepo.signal.value,
        new Date(),
      );
      const fresh = currentItems.find((i) => i.key === item.key);
      if (!fresh?.ref) throw new Error('Запись изменилась. Выберите её ещё раз.');
      const active = activeDeskFocus(current, currentItems, new Date());
      const selected = active.some((i) => i.key === fresh.key);
      if (!selected && active.length >= 3)
        throw new Error('В фокусе уже три действия. Сначала уберите одно.');
      let ref = fresh.ref;
      if (!selected && fresh.needsId) {
        const id = crypto.randomUUID();
        if (ref.area === 'crm' && ref.kind !== 'meeting') {
          const employee = employeesRepo.getById(ref.employeeId);
          if (!employee) throw new Error('Сотрудник не найден');
          const field = ref.kind === 'task' ? 'tasks' : 'development';
          employeesRepo.update(employee.id, {
            [field]: employee[field].map((entry, index) =>
              index === fresh.sourceIndex ? { ...entry, id } : entry,
            ),
          });
          ref = { ...ref, id };
        } else if (ref.area === 'personal') {
          const doc = personalRepo.get(),
            session = await getSession();
          if (!doc || !session || !Array.isArray(doc.todos))
            throw new Error('Личная задача не найдена');
          personalRepo.save(session.user.id, {
            ...doc,
            todos: (doc.todos as unknown[]).map((entry, index) =>
              index === fresh.sourceIndex && entry && typeof entry === 'object'
                ? { ...entry, id }
                : entry,
            ),
          });
          ref = { ...ref, id };
        }
        await syncQueue.flush();
        if (syncQueue.getStatus().pending)
          throw new Error('Сначала дождитесь сохранения исходной записи');
      }
      const next = structuredClone(managementRepo.signal.value);
      next.focus = {
        date: iso(new Date()),
        refs: selected
          ? active.flatMap((i) => (i.ref && focusKey(i.ref) !== focusKey(ref) ? [i.ref] : []))
          : [...active.flatMap((i) => (i.ref ? [i.ref] : [])), ref],
      };
      await managementRepo.save(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function itemRow(item: DeskItem, selected = false) {
    return (
      <div key={item.key} class="flex flex-wrap items-start gap-2 border-t border-white/10 py-3">
        <button class="min-w-0 flex-1 text-left" onClick={() => open(item.target)}>
          <span class="block break-words text-sm font-medium text-slate-200 hover:text-blue-200">
            {item.title}
          </span>
          <span class="mt-1 block text-xs leading-5 text-slate-400">{item.source}</span>
          <span class="block text-xs leading-5 text-slate-500">{item.reason}</span>
        </button>
        {item.ref && (
          <button
            class="shrink-0 rounded-lg px-2 py-1 text-sm text-blue-200 hover:bg-white/5 disabled:opacity-40"
            disabled={busy || (!selected && focus.length >= 3)}
            aria-label={`${selected ? 'Убрать из фокуса' : 'В фокус'}: ${item.title}`}
            onClick={() => void toggleFocus(item)}
          >
            {selected ? 'Убрать' : 'В фокус'}
          </button>
        )}
      </div>
    );
  }
  return (
    <div class="space-y-5" data-workdesk>
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-xs text-slate-500">
            {now.toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
            {now.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <h1 class="mt-1 text-2xl font-semibold">Рабочий стол руководителя</h1>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Обновить данные
          </Button>
          <Button
            variant="secondary"
            onClick={() => loc.route(routes.management.path + '?area=actions&create=1')}
          >
            ＋ Действие
          </Button>
        </div>
      </header>
      {error && (
        <p
          role="alert"
          class="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}
      <section class="rounded-2xl border border-blue-400/20 bg-blue-500/5 p-4" aria-label="Сейчас">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="max-w-3xl">
            <h2 class="text-base font-semibold">
              {guide.current ? `По ритму · ${guide.label}` : 'Можно начать работу сейчас'}
            </h2>
            <p class="mt-1 text-sm leading-6 text-slate-400">
              {guide.current?.detail ??
                'Начните с проверки договорённостей или откройте выбранное дело. Расписание — ориентир, начинать раньше можно.'}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => startWorkflow('start')}>
              Начать день
            </Button>
            {(
              guide.current?.links ?? [
                { label: 'Календарь', target: { route: 'calendar' as const } },
              ]
            ).map((link) => (
              <Button
                key={link.label}
                variant="secondary"
                size="sm"
                onClick={() => open(link.target)}
              >
                {link.label} →
              </Button>
            ))}
          </div>
        </div>
        <p class="mt-2 text-xs text-slate-500">
          Далее: {guide.nextDate} · {guide.next.time} · {guide.next.title}
        </p>
      </section>
      {!loaded ? (
        <p class="p-6 text-sm text-slate-400">
          {error ? 'Исправьте ошибку загрузки и обновите данные.' : 'Собираем рабочий стол…'}
        </p>
      ) : (
        <div class="grid items-start gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <aside
            class={`grid gap-4 md:grid-cols-2 xl:grid-cols-1 ${home ? '' : 'order-2 xl:order-none'}`}
          >
            <section
              class="rounded-2xl border border-white/10 bg-white/5 p-4"
              aria-label="Мой фокус"
            >
              <div class="mb-3 flex items-center justify-between">
                <h2 class="text-base font-semibold">Мой фокус · {focus.length}/3</h2>
                <button
                  class="text-xs text-blue-200"
                  onClick={() => {
                    setSearch('');
                    setPicker(true);
                  }}
                >
                  Добавить в фокус
                </button>
              </div>
              {focus.map((i) => itemRow(i, true))}
              {!focus.length && (
                <p class="text-sm leading-6 text-slate-400">
                  Выберите до трёх действий из Реестра, задач CRM, ИПР или встреч. Завтра состав
                  выбирается заново.
                </p>
              )}
            </section>
            <section
              class="rounded-2xl border border-white/10 bg-white/5 p-4"
              aria-label="Остальное на проверку"
            >
              <h2 class="mb-3 text-base font-semibold">Остальное на проверку · {queue.length}</h2>
              {queue.slice(0, 6).map((i) => itemRow(i))}
              {queue.length > 6 && (
                <details>
                  <summary class="cursor-pointer py-2 text-sm text-blue-200">
                    Ещё {queue.length - 6}
                  </summary>
                  {queue.slice(6).map((i) => itemRow(i))}
                </details>
              )}
              {!queue.length && (
                <p class="text-sm text-slate-400">
                  {focus.length
                    ? 'Актуальные дела уже в фокусе. Выбор не означает, что они выполнены.'
                    : 'Подходящих записей пока нет. Начните день с проверки договорённостей — пустой список не означает отсутствие работы.'}
                </p>
              )}
            </section>
          </aside>
          <section
            class="min-w-0 rounded-2xl border border-white/10 bg-slate-950/30 p-4 sm:p-5"
            aria-label="Рабочая область"
          >
            <div class="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div class="flex items-center gap-3">
                {(!home || workflow) && (
                  <button
                    class="rounded-lg border border-white/10 px-3 py-2 text-sm text-blue-200"
                    onClick={back}
                  >
                    ← Назад
                  </button>
                )}
                <h2 class="text-sm font-medium text-slate-400">Рабочая область</h2>
              </div>
              <div class="flex gap-3">
                <button
                  class="text-xs text-slate-400 hover:text-white"
                  onClick={openCommandPalette}
                >
                  Найти
                </button>
                {(!home || workflow) && (
                  <button
                    class="text-xs text-blue-200"
                    onClick={() => loc.route(routes.dashboard.path)}
                  >
                    Закрыть карточку ×
                  </button>
                )}
              </div>
            </div>
            {home && workflow === 'meeting' ? (
              <MeetingSummary
                openAction={(id) => open({ route: 'management', area: 'actions', recordId: id })}
              />
            ) : home && (workflow === 'start' || workflow === 'close') ? (
              <DayStart
                key={iso(now) + workflow}
                now={now}
                closing={workflow === 'close'}
                items={items}
                hasData={employees.length + teams.length + state.actions.length > 0}
                openItem={(i) => open(i.target)}
                createAction={() => loc.route(routes.management.path + '?area=actions&create=1')}
                chooseFocus={() => setPicker(true)}
                overview={() => loc.route(routes.overview.path)}
                calendar={() => open({ route: 'calendar' })}
              />
            ) : home ? (
              <div class="space-y-6">
                <div>
                  <h3 class="text-xl font-semibold">Что хотите сделать?</h3>
                  <p class="mt-2 text-sm leading-6 text-slate-400">
                    Если ещё не знаете, за что взяться, начните с проверки дня. Дела в фокусе
                    выбраны вами — открыть можно любое.
                  </p>
                  <div class="mt-4 grid gap-3 sm:grid-cols-2">
                    <Button onClick={() => startWorkflow('start')}>Начать день</Button>
                    <Button
                      variant="secondary"
                      onClick={() => loc.route(routes.management.path + '?area=actions&create=1')}
                    >
                      Записать договорённость
                    </Button>
                    <Button variant="secondary" onClick={() => startWorkflow('meeting')}>
                      Записать итог встречи
                    </Button>
                    <Button variant="secondary" onClick={() => open({ route: 'crm' })}>
                      Подготовить встречу с сотрудником
                    </Button>
                    <Button variant="secondary" onClick={() => startWorkflow('close')}>
                      Завершить день
                    </Button>
                    <Button variant="ghost" onClick={() => loc.route(routes.overview.path)}>
                      Обзор команд и сотрудников
                    </Button>
                  </div>
                </div>
                <details>
                  <summary class="cursor-pointer text-sm text-slate-400">
                    Ближайшие даты вне фокуса
                  </summary>
                  {items
                    .filter(
                      (i) => i.date && i.date >= iso(now) && !focus.some((f) => f.key === i.key),
                    )
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .slice(0, 5)
                    .map((i) => (
                      <button
                        key={i.key}
                        class="mt-2 block w-full rounded-lg border border-white/10 p-3 text-left text-sm"
                        onClick={() => open(i.target)}
                      >
                        {i.date} · {i.title}
                      </button>
                    ))}
                  <button
                    class="mt-3 text-sm text-blue-200"
                    onClick={() => open({ route: 'calendar' })}
                  >
                    Открыть календарь →
                  </button>
                </details>
                <details class="border-t border-white/10 pt-4">
                  <summary class="cursor-pointer text-sm text-slate-400">
                    Ритм и редкие проверки
                  </summary>
                  <div class="mt-3 flex flex-wrap gap-2">
                    {[
                      ['rhythm', 'Ритм'],
                      ['review', 'Закрытие недели'],
                      ['planning', 'Квартальный план'],
                      ['people', 'Кадровые исключения'],
                      ['improvements', 'Улучшения'],
                    ].map(([area, label]) => (
                      <Button
                        key={area}
                        variant="secondary"
                        size="sm"
                        onClick={() => open({ route: 'management', area: area! })}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </details>
              </div>
            ) : (
              children
            )}
          </section>
        </div>
      )}
      <Modal open={picker} onClose={closePicker} title="Выбрать фокус дня" maxWidth="lg">
        <p class="mb-3 text-sm text-slate-400">
          До трёх действий из всего портала. Записи сохраняются в своих источниках.
        </p>
        <input
          class="mos-input mb-3 w-full"
          aria-label="Поиск действий для фокуса"
          placeholder="Действие или сотрудник"
          value={search}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
        {error && (
          <p role="alert" class="mb-3 text-sm text-red-200">
            {error}
          </p>
        )}
        <div class="max-h-[55dvh] overflow-y-auto">
          {items
            .filter(
              (i) => i.ref && `${i.title} ${i.source}`.toLowerCase().includes(search.toLowerCase()),
            )
            .map((i) =>
              itemRow(
                i,
                focus.some((f) => f.key === i.key),
              ),
            )}
        </div>
        <Button variant="secondary" onClick={closePicker}>
          Готово
        </Button>
      </Modal>
    </div>
  );
}
