/**
 * Pure-функции для обратной связи о командах.
 *
 * Сортировка / фильтрация / агрегаты + экспорт в Markdown (для AI-анализа
 * во внешних инструментах).
 */
import type { FeedbackMood, FeedbackSource, TeamFeedback } from '@/data/schema';

export const SOURCE_LABEL: Record<FeedbackSource, string> = {
  dpo: 'DPO',
  lead: 'Лид',
  peer: 'Peer',
  self: 'Я',
};

export const MOOD_LABEL: Record<FeedbackMood, string> = {
  positive: 'позитивно',
  neutral: 'нейтрально',
  concern: 'тревожно',
};

export const MOOD_GLYPH: Record<FeedbackMood, string> = {
  positive: '🟢',
  neutral: '⚪️',
  concern: '🔴',
};

/** Записи для команды, отсортированные по дате DESC (новые сверху). */
export function feedbackForTeam(all: TeamFeedback[], teamId: string): TeamFeedback[] {
  return all
    .filter((f) => f.teamId === teamId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function filterBySource(
  list: TeamFeedback[],
  source: 'all' | FeedbackSource,
): TeamFeedback[] {
  if (source === 'all') return list;
  return list.filter((f) => f.source === source);
}

/** Сводка по mood. */
export function moodCounts(list: TeamFeedback[]): Record<FeedbackMood, number> {
  const out: Record<FeedbackMood, number> = { positive: 0, neutral: 0, concern: 0 };
  for (const f of list) {
    out[f.mood] = (out[f.mood] ?? 0) + 1;
  }
  return out;
}

/** Все темы в порядке частоты (DESC). */
export function topThemes(list: TeamFeedback[], limit = 10): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const f of list) {
    for (const t of f.themes ?? []) {
      const k = t.trim();
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// ---------------------------------------------------------------
// Экспорт в Markdown — формат, заточенный под скармливание в AI
// ---------------------------------------------------------------

/**
 * Возвращает Markdown с записями feedback по одной команде.
 * Подходит для копи-паста в ChatGPT/Claude с просьбой проанализировать.
 */
export function feedbackToMarkdown(
  team: { name: string; color?: string },
  list: TeamFeedback[],
): string {
  const lines: string[] = [];
  lines.push(`# Обратная связь — команда «${team.name}»`);
  lines.push('');
  lines.push(`Записей: ${list.length}`);
  if (list.length > 0) {
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = sorted[0]!.date;
    const last = sorted[sorted.length - 1]!.date;
    lines.push(`Период: ${first} … ${last}`);
  }
  const counts = moodCounts(list);
  lines.push(
    `Mood: 🟢 ${counts.positive} · ⚪️ ${counts.neutral} · 🔴 ${counts.concern}`,
  );
  const themes = topThemes(list, 20);
  if (themes.length > 0) {
    lines.push('');
    lines.push(`Темы: ${themes.map((t) => `${t.name} (${t.count})`).join(', ')}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Новые сверху — удобнее для аналитика.
  const sortedDesc = [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const f of sortedDesc) {
    lines.push(`## ${f.date} · ${SOURCE_LABEL[f.source]}${f.author ? ` (${f.author})` : ''}`);
    lines.push('');
    lines.push(`**Настроение:** ${MOOD_GLYPH[f.mood]} ${MOOD_LABEL[f.mood]}`);
    if (f.themes.length > 0) {
      lines.push(`**Темы:** ${f.themes.join(', ')}`);
    }
    if (f.note.trim()) {
      lines.push('');
      lines.push(f.note.trim());
    }
    if (f.actionItems.length > 0) {
      lines.push('');
      lines.push('**Action items:**');
      for (const a of f.actionItems) {
        const check = a.done ? '[x]' : '[ ]';
        const due = a.due ? ` (срок ${a.due})` : '';
        lines.push(`- ${check} ${a.text}${due}`);
      }
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/** JSON-сериализация для машинной обработки. */
export function feedbackToJson(team: { name: string }, list: TeamFeedback[]): string {
  return JSON.stringify(
    {
      team: team.name,
      exportedAt: new Date().toISOString(),
      count: list.length,
      records: list,
    },
    null,
    2,
  );
}
