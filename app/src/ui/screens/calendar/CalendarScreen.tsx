import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { employeesRepo } from '@/infra/repos';
import { employeeUrl } from '@/app/routes';
import {
  buildMonthEvents,
  buildMonthGrid,
  type CalendarEvent,
  type CalendarEventKind,
} from '@/domain/calendar';
import { toast } from '@/state/ui';
import { Button } from '@/ui/components/Button';

const RU_MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const RU_DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const KIND_LABEL: Record<CalendarEventKind, string> = {
  vacation: 'Отпуск',
  sick: 'Больничный',
  birthday: 'ДР',
  hire: 'Годовщина',
  oneonone: '1-on-1',
  taskDue: 'Задача',
};

const KIND_STYLE: Record<CalendarEventKind, string> = {
  vacation: 'bg-blue-500/20 text-blue-200 hover:bg-blue-500/30',
  sick: 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30',
  birthday: 'bg-pink-500/20 text-pink-200 hover:bg-pink-500/30',
  hire: 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30',
  oneonone: 'bg-purple-500/20 text-purple-200 hover:bg-purple-500/30',
  taskDue: 'bg-red-500/20 text-red-200 hover:bg-red-500/30',
};

/**
 * Экран `/calendar` — месячная сетка с отпусками, больничными, годовщинами,
 * 1-on-1 и дедлайнами задач. Источник данных — `employeesRepo`.
 *
 * Навигация: ◀ Сегодня ▶, переключатель месяцев. Клик по чипу события
 * ведёт в карточку соответствующего сотрудника.
 */
export function CalendarScreen(): JSX.Element {
  const loc = useLocation();
  const employees = employeesRepo.signal.value;
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  useEffect(() => {
    employeesRepo.loadAll().catch((e: unknown) => {
      toast.error(`Не удалось загрузить календарь: ${e instanceof Error ? e.message : String(e)}`);
    });
  }, []);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const cells = useMemo(() => buildMonthGrid(year, month, today), [year, month, today]);
  const eventsByDay = useMemo(
    () => buildMonthEvents(employees, year, month),
    [employees, year, month],
  );

  // Сводка событий месяца (для бара под заголовком).
  const totals = useMemo(() => {
    const t: Record<CalendarEventKind, number> = {
      vacation: 0,
      sick: 0,
      birthday: 0,
      hire: 0,
      oneonone: 0,
      taskDue: 0,
    };
    for (const list of eventsByDay.values()) {
      // Отпуска/больничные считаем по сотрудникам, а не по дням, иначе будет
      // завышено в несколько раз. Для остальных типов дней мало, считаем как есть.
      for (const ev of list) {
        if (ev.kind === 'vacation' || ev.kind === 'sick') continue;
        t[ev.kind] += 1;
      }
    }
    // Считаем сотрудников с отпуском/больничным в этом месяце как уникальные пары (kind+empId).
    const seen = new Set<string>();
    for (const list of eventsByDay.values()) {
      for (const ev of list) {
        if (ev.kind !== 'vacation' && ev.kind !== 'sick') continue;
        const key = `${ev.kind}:${ev.empId}`;
        if (!seen.has(key)) {
          seen.add(key);
          t[ev.kind] += 1;
        }
      }
    }
    return t;
  }, [eventsByDay]);

  function goPrev(): void {
    setCursor(new Date(year, month - 1, 1));
  }
  function goNext(): void {
    setCursor(new Date(year, month + 1, 1));
  }
  function goToday(): void {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  return (
    <div class="space-y-4">
      <header class="flex flex-wrap items-center gap-3">
        <h2 class="text-2xl font-semibold">Календарь</h2>
        <div class="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={goPrev} aria-label="Предыдущий месяц">
            ◀
          </Button>
          <span class="min-w-[10rem] text-center text-base tabular-nums text-slate-100">
            {RU_MONTHS[month]} {year}
          </span>
          <Button variant="secondary" size="sm" onClick={goNext} aria-label="Следующий месяц">
            ▶
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday}>
            Сегодня
          </Button>
        </div>
      </header>

      <section class="flex flex-wrap items-center gap-2 text-xs">
        {(Object.keys(KIND_LABEL) as CalendarEventKind[]).map((k) => (
          <span key={k} class={`rounded-full px-2 py-0.5 ${KIND_STYLE[k]}`}>
            {KIND_LABEL[k]}: {totals[k]}
          </span>
        ))}
      </section>

      <div class="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        {RU_DOW.map((d, i) => (
          <div
            key={d}
            class={`bg-slate-950/40 px-2 py-1.5 text-xs uppercase tracking-wide ${
              i >= 5 ? 'text-red-300/70' : 'text-slate-400'
            }`}
          >
            {d}
          </div>
        ))}
        {cells.map((c) => {
          const evs = eventsByDay.get(c.iso) ?? [];
          return (
            <div
              key={c.iso}
              class={`min-h-[6.5rem] bg-slate-950/40 p-1.5 ${
                c.inMonth ? '' : 'opacity-40'
              } ${c.isToday ? 'ring-1 ring-blue-500/60' : ''}`}
            >
              <div
                class={`mb-1 text-xs tabular-nums ${
                  c.isWeekend ? 'text-red-300/80' : 'text-slate-300'
                } ${c.isToday ? 'font-semibold text-blue-300' : ''}`}
              >
                {c.day}
              </div>
              <div class="flex flex-col gap-1">
                {evs.slice(0, 4).map((ev, idx) => (
                  <EventChip key={idx} event={ev} onOpen={() => loc.route(employeeUrl(ev.empId))} />
                ))}
                {evs.length > 4 && (
                  <span class="text-[10px] text-slate-500">+{evs.length - 4} ещё</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventChip({
  event,
  onOpen,
}: {
  event: CalendarEvent;
  onOpen: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${event.empName}: ${event.label}`}
      class={`truncate rounded px-1.5 py-0.5 text-left text-[11px] leading-tight ${KIND_STYLE[event.kind]}`}
    >
      {event.empName}
    </button>
  );
}
