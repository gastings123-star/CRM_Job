/**
 * Расчёт риска увольнения сотрудника.
 *
 * Перенесено из legacy `index.html#calcRiskScore` без изменений в логике
 * весов, но с явной зависимостью от `now` и без обращений к глобалам.
 */
import type { Employee } from '@/data/schema';
import { monthsSince, dayDiff, parseIsoDate, toIsoDate } from './dates';

export type RiskScoreLevel = 'low' | 'medium' | 'high';

export interface RiskScore {
  /** Целое 0..100 — уровень риска. */
  score: number;
  level: RiskScoreLevel;
  /** Человекочитаемые причины, попавшие в score. */
  drivers: string[];
}

/**
 * Расчитывает риск увольнения по эвристикам:
 * - просрочен пересмотр ФОТ;
 * - перегрузка по `load.currentPercent`;
 * - редкие/отсутствующие 1-on-1;
 * - просрочки/отставание ИПР;
 * - низкая оценка руководителя.
 *
 * Вес и пороги зафиксированы в legacy — их менять без согласования нельзя,
 * иначе сломаются исторические сравнения.
 */
export function calcRiskScore(e: Employee, now: Date): RiskScore {
  let score = 0;
  const drivers: string[] = [];

  // Пересмотр ФОТ
  const fotM = monthsSince(e.salaryReviewDate ?? '', now);
  if (fotM > 12) {
    score += 0.3;
    drivers.push(`Нет пересмотра ФОТ ${fotM} мес.`);
  } else if (fotM > 9) {
    score += 0.1;
    drivers.push(`Пересмотр ФОТ скоро (${fotM} мес.)`);
  }

  // Загрузка
  const load = Number(e.load?.currentPercent) || 0;
  if (load > 100) {
    score += 0.25;
    drivers.push(`Перегрузка ${load}%`);
  } else if (load > 90) {
    score += 0.12;
    drivers.push(`Высокая загрузка ${load}%`);
  }

  // 1-on-1
  const lastOoo = e.oneOnOne?.history?.[0]?.date ?? '';
  const lastOooDate = parseIsoDate(lastOoo);
  const ooodays = lastOooDate ? dayDiff(lastOooDate, now) : 9999;
  if (ooodays > 60) {
    score += 0.2;
    drivers.push(`1-on-1 не было ${ooodays === 9999 ? 'никогда' : `${ooodays} дней`}`);
  } else if (ooodays > 30) {
    score += 0.08;
    drivers.push(`1-on-1 ${ooodays} дней назад`);
  }

  // ИПР: просрочки
  const todayStr = toIsoDate(now);
  const development = e.development ?? [];
  const overdueDev = development.filter(
    (d) => d.status !== 'выполнено' && d.deadline && d.deadline < todayStr,
  ).length;
  if (overdueDev > 0) {
    score += overdueDev * 0.08;
    drivers.push(`Просрочено ИПР: ${overdueDev}`);
  }

  // ИПР: процент выполнения
  const iprDone = development.filter((d) => d.status === 'выполнено').length;
  const iprTotal = development.length;
  if (iprTotal > 0 && iprDone / iprTotal < 0.4) {
    score += 0.12;
    drivers.push('ИПР выполнен < 40%');
  }

  // Оценка руководителя
  const manScore = Number(e.managerRating?.score) || 3;
  if (manScore <= 2) {
    score += 0.15;
    drivers.push(`Низкая оценка руководителя (${manScore}/5)`);
  }

  score = Math.min(1, score);
  const level: RiskScoreLevel = score >= 0.6 ? 'high' : score >= 0.35 ? 'medium' : 'low';

  return { score: Math.round(score * 100), level, drivers };
}

// ---------------------------------------------------------------
// Бейдж — данные для UI (без HTML).
// ---------------------------------------------------------------

export interface RiskBadgeData {
  level: RiskScoreLevel;
  label: string;
  score: number;
  bg: string;
  color: string;
  border: string;
}

const BADGE_STYLE: Record<RiskScoreLevel, Omit<RiskBadgeData, 'score' | 'level'>> = {
  high: {
    label: 'Высокий',
    bg: 'rgba(220,38,38,0.12)',
    color: '#991b1b',
    border: 'rgba(220,38,38,0.25)',
  },
  medium: {
    label: 'Средний',
    bg: 'rgba(217,119,6,0.12)',
    color: '#92400e',
    border: 'rgba(217,119,6,0.25)',
  },
  low: {
    label: 'Низкий',
    bg: 'rgba(5,150,105,0.10)',
    color: '#065f46',
    border: 'rgba(5,150,105,0.20)',
  },
};

/** Данные бейджа риска. UI сам решает, как рендерить. */
export function riskBadge(level: RiskScoreLevel, score: number): RiskBadgeData {
  return { level, score, ...BADGE_STYLE[level] };
}
