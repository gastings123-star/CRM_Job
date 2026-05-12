import type { JSX } from 'preact';

export interface PlaceholderProps {
  title: string;
  description?: string;
}

/**
 * Временный экран-заглушка для маршрутов, которые ещё не реализованы.
 * Удалится по мере наполнения экранов реальной функциональностью.
 */
export function Placeholder({ title, description }: PlaceholderProps): JSX.Element {
  return (
    <div class="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
      <h2 class="mb-2 text-2xl font-semibold">{title}</h2>
      <p class="text-slate-400">
        {description ?? 'Экран будет реализован на следующих этапах ребилда.'}
      </p>
    </div>
  );
}
