/**
 * Глобальный сигнал открытости command palette (Cmd+K).
 *
 * Любой компонент может звать `openCommandPalette()`. Хост палитры
 * (CommandPaletteHost) подписывается на сигнал и рендерит модалку.
 *
 * Хоткей Cmd+K / Ctrl+K вешается там же — централизованно.
 */
import { signal } from '@preact/signals';
import type { Employee } from '@/data/schema';

export const paletteOpenSignal = signal(false);

export interface PaletteEmployeeHit {
  id: string;
  title: string;
  subtitle: string;
  /** Внутренний score — для сортировки/диагностики. */
  score: number;
}

/**
 * Чистая функция ранжирования сотрудников под запрос палитры.
 * Используется и в компоненте, и в юнит-тестах (без DOM).
 */
export function rankEmployees(employees: Employee[], rawQuery: string, limit = 8): PaletteEmployeeHit[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  return employees
    .map((e) => {
      const name = (e.fullName ?? '').toLowerCase();
      const role = (e.role ?? '').toLowerCase();
      const email = (e.email ?? '').toLowerCase();
      let score = 0;
      if (name.startsWith(q)) score += 10;
      else if (name.includes(q)) score += 5;
      if (role.includes(q)) score += 2;
      if (email.includes(q)) score += 2;
      return {
        id: e.id,
        title: e.fullName || '— без имени —',
        subtitle: [e.role, e.team, e.grade].filter(Boolean).join(' · '),
        score,
      };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function openCommandPalette(): void {
  paletteOpenSignal.value = true;
}

export function closeCommandPalette(): void {
  paletteOpenSignal.value = false;
}

export function toggleCommandPalette(): void {
  paletteOpenSignal.value = !paletteOpenSignal.value;
}
