import { useState } from 'preact/hooks';
import { dayChecks } from '@/domain/day-checks';
import type { DeskItem } from '@/domain/workdesk';
import { Button } from '@/ui/components/Button';
import { readProgress, saveProgress, progressKey } from '@/state/day-progress';
export function DayStart({
  items,
  now,
  closing,
  hasData,
  openItem,
  createAction,
  chooseFocus,
  overview,
  calendar,
}: {
  items: DeskItem[];
  now: Date;
  closing: boolean;
  hasData: boolean;
  openItem: (i: DeskItem) => void;
  createAction: () => void;
  chooseFocus: () => void;
  overview: () => void;
  calendar: () => void;
}) {
  const steps = dayChecks(items, now, closing),
    key = progressKey(now, closing);
  const [progress, setProgress] = useState(() => readProgress(key)),
    [index, setIndex] = useState(() => {
      const done = readProgress(key);
      const first = steps.findIndex((s) => !done[s.id]);
      return first < 0 ? steps.length : first;
    }),
    [saveError, setSaveError] = useState('');
  const step = steps[index];
  function mark(status: 'checked' | 'deferred') {
    if (!step) return;
    const next = { ...progress, [step.id]: status };
    setProgress(next);
    setSaveError(
      saveProgress(key, next)
        ? ''
        : 'Браузер не сохранил отметки проверки. До закрытия страницы они доступны.',
    );
    setIndex((i) => i + 1);
  }
  return (
    <div class="space-y-5">
      <h3 class="text-xl font-semibold">{closing ? 'Завершить день' : 'Начать день'}</h3>
      <p class="text-sm text-slate-400">
        Проверка ситуации помогает найти работу. Никаких задач автоматически не создаётся.
      </p>
      {!hasData && (
        <div class="rounded-xl border border-amber-400/20 p-4">
          <p class="text-sm">
            Пока недостаточно данных для конкретных рекомендаций. Начните с ближайших встреч и
            договорённостей.
          </p>
          <Button variant="ghost" onClick={overview}>
            Добавить людей и команды через Обзор
          </Button>
        </div>
      )}
      <nav class="flex flex-wrap gap-2" aria-label="Шаги проверки">
        {steps.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setIndex(i)}
            aria-current={index === i ? 'step' : undefined}
            class={`rounded-lg border px-3 py-2 text-xs ${index === i ? 'border-blue-400 text-blue-200' : 'border-white/10 text-slate-400'}`}
          >
            {i + 1}. {s.title}
            {progress[s.id] === 'checked'
              ? ' · проверено'
              : progress[s.id] === 'deferred'
                ? ' · позже'
                : ''}
          </button>
        ))}
      </nav>
      {step ? (
        <section class="space-y-4 rounded-xl border border-white/10 p-4">
          <h4 class="text-lg font-medium">{step.title}</h4>
          <p class="text-sm text-slate-300">{step.why}</p>
          <p class="text-sm leading-6 text-slate-400">{step.instruction}</p>
          {step.items.slice(0, 4).map((i) => (
            <button
              key={i.key}
              class="block w-full rounded-lg border border-white/10 p-3 text-left text-sm"
              onClick={() => openItem(i)}
            >
              {i.title}
              <span class="mt-1 block text-xs text-slate-400">
                {i.source} · {i.reason}
              </span>
            </button>
          ))}
          {step.items.length > 4 && (
            <details>
              <summary class="cursor-pointer text-sm text-slate-400">
                Ещё {step.items.length - 4}
              </summary>
              {step.items.slice(4).map((i) => (
                <button
                  key={i.key}
                  class="mt-2 block text-left text-sm text-blue-200"
                  onClick={() => openItem(i)}
                >
                  {i.title}
                </button>
              ))}
            </details>
          )}
          {!step.items.length && (
            <p class="text-sm text-slate-400">
              В портале подходящих записей нет. Проверьте вопрос по доступным вам источникам.
            </p>
          )}
          <div class="flex flex-wrap gap-2">
            <Button onClick={createAction}>Есть вопрос — записать действие</Button>
            <Button variant="secondary" onClick={() => mark('checked')}>
              Проверил, можно дальше
            </Button>
            <Button variant="ghost" onClick={() => mark('deferred')}>
              Вернуться позже
            </Button>
            {step.id === 'upcoming' && (
              <Button variant="ghost" onClick={calendar}>
                Открыть календарь
              </Button>
            )}
          </div>
          <p class="text-xs text-slate-500">
            Отметка завершает только проверку, не закрывает ваши задачи.
          </p>
        </section>
      ) : (
        <section class="space-y-3 rounded-xl border border-white/10 p-4">
          <h4 class="text-lg font-medium">
            {steps.some((s) => progress[s.id] === 'deferred')
              ? 'Есть отложенные проверки'
              : 'Проверка завершена'}
          </h4>
          <p class="text-sm text-slate-400">
            {closing
              ? 'Проверьте статусы оставшихся дел в исходных карточках. Даты не переносятся автоматически.'
              : 'Выберите до трёх действий на сегодня. Если действий пока нет, не нужно создавать их ради заполнения фокуса.'}
          </p>
          <Button onClick={chooseFocus}>Выбрать действия в фокус</Button>
          <Button variant="ghost" onClick={() => setIndex(0)}>
            Вернуться к проверкам
          </Button>
        </section>
      )}
      {saveError && (
        <p role="alert" class="text-sm text-amber-200">
          {saveError}
        </p>
      )}
    </div>
  );
}
