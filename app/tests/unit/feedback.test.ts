import { describe, expect, it } from 'vitest';
import {
  feedbackForTeam,
  feedbackToJson,
  feedbackToMarkdown,
  filterBySource,
  moodCounts,
  topThemes,
} from '@/domain/feedback';
import type { TeamFeedback } from '@/data/schema';

function f(over: Partial<TeamFeedback>): TeamFeedback {
  return {
    id: Math.random().toString(36).slice(2),
    teamId: 't1',
    date: '2026-05-13',
    source: 'dpo',
    author: '',
    mood: 'neutral',
    themes: [],
    note: '',
    actionItems: [],
    ...over,
  };
}

describe('feedbackForTeam', () => {
  it('фильтрует по teamId и сортирует DESC по дате', () => {
    const all = [
      f({ teamId: 't1', date: '2026-04-01' }),
      f({ teamId: 't2', date: '2026-05-01' }),
      f({ teamId: 't1', date: '2026-05-05' }),
    ];
    const r = feedbackForTeam(all, 't1');
    expect(r.length).toBe(2);
    expect(r[0]!.date).toBe('2026-05-05'); // самые новые сверху
    expect(r[1]!.date).toBe('2026-04-01');
  });
});

describe('filterBySource', () => {
  it('all возвращает всех', () => {
    const list = [f({ source: 'dpo' }), f({ source: 'lead' })];
    expect(filterBySource(list, 'all').length).toBe(2);
  });
  it('фильтрует по конкретному источнику', () => {
    const list = [f({ source: 'dpo' }), f({ source: 'lead' }), f({ source: 'dpo' })];
    expect(filterBySource(list, 'dpo').length).toBe(2);
    expect(filterBySource(list, 'peer').length).toBe(0);
  });
});

describe('moodCounts', () => {
  it('считает по всем трём ключам', () => {
    const list = [
      f({ mood: 'positive' }),
      f({ mood: 'concern' }),
      f({ mood: 'concern' }),
      f({ mood: 'neutral' }),
    ];
    expect(moodCounts(list)).toEqual({ positive: 1, neutral: 1, concern: 2 });
  });
});

describe('topThemes', () => {
  it('считает темы и сортирует по частоте DESC', () => {
    const list = [
      f({ themes: ['ресурсы', 'процессы'] }),
      f({ themes: ['ресурсы'] }),
      f({ themes: ['найм', 'процессы'] }),
    ];
    const r = topThemes(list);
    expect(r[0]?.name).toBe('процессы'); // total=2
    expect(r[0]?.count).toBe(2);
    expect(r.length).toBe(3);
  });
  it('игнорирует пустые строки', () => {
    const list = [f({ themes: ['', '  '] })];
    expect(topThemes(list)).toEqual([]);
  });
});

describe('feedbackToMarkdown', () => {
  it('содержит заголовок команды, сводку и записи новые сверху', () => {
    const list = [
      f({ date: '2026-04-01', mood: 'neutral', note: 'Старая запись', themes: ['А'] }),
      f({ date: '2026-05-05', mood: 'concern', note: 'Новая запись', themes: ['Б'] }),
    ];
    const md = feedbackToMarkdown({ name: 'ЕФС Alpha' }, list);
    expect(md).toContain('# Обратная связь — команда «ЕФС Alpha»');
    expect(md).toContain('Записей: 2');
    expect(md).toContain('Период: 2026-04-01 … 2026-05-05');
    // Новая выше старой
    const newIdx = md.indexOf('Новая запись');
    const oldIdx = md.indexOf('Старая запись');
    expect(newIdx).toBeGreaterThan(0);
    expect(newIdx).toBeLessThan(oldIdx);
  });

  it('рендерит action items как чекбоксы', () => {
    const list = [
      f({
        actionItems: [
          { id: '1', text: 'Сделать X', done: false, due: '2026-05-20' },
          { id: '2', text: 'Сделать Y', done: true, due: '' },
        ],
      }),
    ];
    const md = feedbackToMarkdown({ name: 'T' }, list);
    expect(md).toContain('[ ] Сделать X (срок 2026-05-20)');
    expect(md).toContain('[x] Сделать Y');
  });

  it('пустой список — корректная сводка', () => {
    const md = feedbackToMarkdown({ name: 'T' }, []);
    expect(md).toContain('Записей: 0');
    expect(md).not.toContain('Период:');
  });
});

describe('feedbackToJson', () => {
  it('возвращает корректный JSON с команда + count + records', () => {
    const list = [f({ note: 'hi' })];
    const json = JSON.parse(feedbackToJson({ name: 'T' }, list)) as {
      team: string;
      count: number;
      records: TeamFeedback[];
    };
    expect(json.team).toBe('T');
    expect(json.count).toBe(1);
    expect(json.records[0]?.note).toBe('hi');
  });
});
