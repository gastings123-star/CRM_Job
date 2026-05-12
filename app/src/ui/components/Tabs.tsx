import type { ComponentChildren, JSX } from 'preact';

export interface TabItem {
  id: string;
  label: string;
  /** Опциональный счётчик справа от label. */
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  /** Доп. контент справа от линии вкладок (фильтры, иконки и т.п.). */
  rightSlot?: ComponentChildren;
}

export function Tabs({ items, active, onChange, rightSlot }: TabsProps): JSX.Element {
  return (
    <div class="flex items-end justify-between border-b border-white/10">
      <div role="tablist" class="flex gap-1">
        {items.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              class={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
                isActive
                  ? 'border-blue-500 text-blue-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              } disabled:opacity-40`}
            >
              {tab.label}
              {typeof tab.count === 'number' && (
                <span class="ml-1.5 rounded-full bg-white/10 px-1.5 text-xs text-slate-200">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {rightSlot && <div class="mb-1.5">{rightSlot}</div>}
    </div>
  );
}
