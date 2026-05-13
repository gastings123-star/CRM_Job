import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  paletteOpenSignal,
  closeCommandPalette,
  rankEmployees,
  toggleCommandPalette,
} from '@/state/command-palette';
import { employeesRepo } from '@/infra/repos';
import { employeeUrl, navItems, routes } from '@/app/routes';

/**
 * Глобальная палитра команд (Cmd+K / Ctrl+K).
 *
 * Источники результатов:
 *  - Сотрудники по ФИО / роли / email (топ-8 по релевантности)
 *  - Навигация по основным экранам (по `routes`)
 *
 * Управление с клавиатуры: ↑/↓ — перебор, Enter — открыть, Esc — закрыть.
 */
type Result =
  | { kind: 'employee'; id: string; title: string; subtitle: string }
  | { kind: 'route'; path: string; title: string };

export function CommandPaletteHost(): JSX.Element | null {
  const open = paletteOpenSignal.value;
  const loc = useLocation();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Читаем employees через сигнал в body компонента — это даёт реактивность
  // в useMemo через зависимость, иначе signal-чтения внутри useMemo не
  // триггерят пересчёт при изменении значения.
  const employees = employeesRepo.signal.value;

  // Хоткей: Cmd+K / Ctrl+K — открыть/закрыть. Esc — закрыть.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      } else if (e.key === 'Escape' && paletteOpenSignal.value) {
        closeCommandPalette();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // При открытии — фокус и сброс query.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // setTimeout, чтобы input уже был в DOM.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const routeResults: Result[] = navItems
      .map((k) => routes[k])
      .filter((r) => !q || r.label.toLowerCase().includes(q))
      .map((r) => ({ kind: 'route', path: r.path, title: r.label }));

    if (!q) {
      // Без запроса — только навигация (короткий список).
      return routeResults;
    }

    const employeeResults: Result[] = rankEmployees(employees, q).map((h) => ({
      kind: 'employee',
      id: h.id,
      title: h.title,
      subtitle: h.subtitle,
    }));

    return [...employeeResults, ...routeResults];
  }, [query, employees]);

  if (!open) return null;

  function choose(r: Result): void {
    closeCommandPalette();
    if (r.kind === 'employee') loc.route(employeeUrl(r.id));
    else loc.route(r.path);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const r = results[active];
      if (r) choose(r);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Палитра команд"
      class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={() => closeCommandPalette()}
    >
      <div
        class="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="border-b border-white/10 p-2">
          <input
            ref={inputRef}
            value={query}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Поиск по сотрудникам или странице…"
            class="w-full bg-transparent px-3 py-2 text-base outline-none placeholder:text-slate-500"
          />
        </div>

        {results.length === 0 ? (
          <p class="px-4 py-6 text-center text-sm text-slate-500">
            Ничего не нашлось по «{query}»
          </p>
        ) : (
          <ul class="max-h-[50vh] overflow-y-auto py-1">
            {results.map((r, i) => (
              <li key={r.kind === 'employee' ? `e:${r.id}` : `r:${r.path}`}>
                <button
                  type="button"
                  onClick={() => choose(r)}
                  onMouseEnter={() => setActive(i)}
                  class={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                    i === active ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <span
                    class={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                      r.kind === 'employee'
                        ? 'bg-blue-500/20 text-blue-200'
                        : 'bg-purple-500/20 text-purple-200'
                    }`}
                  >
                    {r.kind === 'employee' ? 'Сотрудник' : 'Страница'}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm text-slate-100">{r.title}</span>
                    {r.kind === 'employee' && r.subtitle && (
                      <span class="block truncate text-xs text-slate-500">{r.subtitle}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <footer class="flex items-center justify-between border-t border-white/10 px-3 py-1.5 text-[11px] text-slate-500">
          <span>↑↓ — выбор · Enter — открыть · Esc — закрыть</span>
          <span>Cmd/Ctrl+K — открыть</span>
        </footer>
      </div>
    </div>
  );
}
