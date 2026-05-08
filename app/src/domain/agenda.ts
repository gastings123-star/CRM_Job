/**
 * Авто-повестка для 1-on-1.
 * Перенесено из legacy `index.html#buildAutoAgenda`.
 */
import type { Employee } from '@/data/schema';
import { monthsSince, toIsoDate } from './dates';
import { calcRiskScore } from './risk';

/**
 * Строит список пунктов повестки для встречи 1-on-1 на основе данных сотрудника.
 * Возвращает массив строк (порядок имеет значение — UI покажет «как есть»).
 */
export function buildAutoAgenda(e: Employee, now: Date): string[] {
  const items: string[] = [];
  const todayStr = toIsoDate(now);

  // Пересмотр ФОТ
  const fotM = monthsSince(e.salaryReviewDate ?? '', now);
  if (fotM >= 10) {
    items.push(`Обсудить пересмотр ФОТ (${fotM} мес. без изменений)`);
  }

  // Загрузка
  const load = Number(e.load?.currentPercent) || 0;
  if (load > 90) {
    items.push(`Загрузка ${load}% — обсудить приоритеты`);
  }

  // Просроченные задачи
  const overdueTasks = (e.tasks ?? []).filter(
    (t) => t.status !== 'выполнена' && t.due && t.due < todayStr,
  );
  if (overdueTasks.length) {
    items.push(`Просроченные задачи: ${overdueTasks.length} шт.`);
  }

  // Просроченные ИПР
  const overdueDev = (e.development ?? []).filter(
    (d) => d.status !== 'выполнено' && d.deadline && d.deadline < todayStr,
  );
  if (overdueDev.length) {
    items.push(`Просроченные цели ИПР: ${overdueDev.map((d) => d.zone).join(', ')}`);
  }

  // Высокий риск
  const rs = calcRiskScore(e, now);
  if (rs.level === 'high') {
    items.push('Высокий риск увольнения — обсудить мотивацию');
  }

  // Цели с низким прогрессом
  const openGoals = (e.goals ?? []).filter(
    (g) => g.status === 'в работе' && (Number(g.progress) || 0) < 30,
  );
  if (openGoals.length) {
    items.push(`Цели с низким прогрессом: ${openGoals.length} шт.`);
  }

  // Готовность к повышению
  if (e.promotionReadiness === 'готов сейчас') {
    items.push('Готов к повышению — обсудить план');
  }

  return items;
}
