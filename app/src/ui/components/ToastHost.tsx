import type { JSX } from 'preact';
import { dismissToast, toastsSignal, type ToastKind } from '@/state/ui';

const colors: Record<ToastKind, string> = {
  info: 'bg-slate-700 text-slate-100',
  success: 'bg-emerald-600 text-white',
  warn: 'bg-amber-600 text-white',
  error: 'bg-red-600 text-white',
};

const icons: Record<ToastKind, string> = {
  info: 'ℹ',
  success: '✓',
  warn: '!',
  error: '×',
};

/**
 * Глобальный контейнер тостов. Подвешивается один раз в шапке приложения
 * и слушает `toastsSignal`.
 */
export function ToastHost(): JSX.Element {
  const items = toastsSignal.value;
  return (
    <div
      aria-live="polite"
      class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          class={`pointer-events-auto flex items-start gap-2 rounded-lg px-3 py-2 shadow-lg ${colors[t.kind]}`}
        >
          <span aria-hidden="true" class="font-bold">
            {icons[t.kind]}
          </span>
          <span class="flex-1 text-sm">{t.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label="Закрыть"
            class="text-white/70 hover:text-white"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
