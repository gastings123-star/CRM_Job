import { describe, it, expect } from 'vitest';
import { emptyManagement, type ManagementRow } from '@/data/management';
import {
  applicable,
  managementCockpit,
  weeklyManagement,
  validateManagement,
  weekBounds,
  sprintWeek,
  managementEvents,
} from '@/domain/management';
const now = new Date(2026, 8, 10, 10);
const action = (id: string, patch: Record<string, string> = {}): ManagementRow => ({
  id,
  title: 'Проверить результат',
  type: 'СВОЯ',
  due: '2026-09-10',
  status: 'OPEN',
  assignee: '',
  employeeId: '',
  teamId: '',
  source: '',
  ...patch,
});
const problem = (id: string, patch: Record<string, string> = {}): ManagementRow => ({
  id,
  title: 'Системная проблема',
  contour: 'Контур',
  teamId: '',
  category: 'Process',
  owner: 'Руководитель',
  due: '2026-09-10',
  criterion: 'Подтверждён эффект',
  status: 'NEW',
  ...patch,
});
describe('Management OS invariants', () => {
  it('starts without tasks, problems, fabricated Green assessments or focus', () => {
    const s = emptyManagement();
    expect(validateManagement(s, null, now)).toEqual(s);
    expect(s.signals).toEqual([]);
    expect(managementCockpit(s, now).focus).toEqual([]);
  });
  it('uses calendar week, including month boundary', () => {
    expect(weekBounds(now)).toEqual(['2026-09-07', '2026-09-13']);
    expect(weekBounds(new Date(2026, 10, 1))).toEqual(['2026-10-26', '2026-11-01']);
  });
  it('calculates sprint week without shifting quarterly anchors', () => {
    expect(sprintWeek('', now)).toBe(null);
    expect(sprintWeek('2026-09-07', now)).toBe(1);
    expect(sprintWeek('2026-08-24', now)).toBe(3);
    expect(sprintWeek('2026-08-17', now)).toBe(1);
    expect(sprintWeek('2026-09-14', now)).toBe(null);
  });
  it('shows only Attention/Critical and applicable signals', () => {
    const s = emptyManagement();
    s.scopes = [{ id: 'scope', teamId: 't', scope: 'people' }];
    s.signals = [
      { id: 'a', teamId: 't', signal: 'people', level: 'Attention', basis: 'Риск' },
      { id: 'b', teamId: 't', signal: 'lead', level: 'Critical', basis: 'Не применяется' },
      { id: 'c', teamId: 't', signal: 'people', level: 'Green', basis: 'Норма' },
    ];
    expect(managementCockpit(s, now).attention.map((x) => x.id)).toEqual(['a']);
    expect(applicable(undefined, 'people')).toBe(false);
  });
  it('does not show a future WAITING merely because its deadline is tomorrow', () => {
    const s = emptyManagement();
    s.actions = [
      action('a'),
      action('b', { due: '2026-09-11' }),
      action('c', { status: 'WAITING', due: '2026-09-11' }),
      action('d', { status: 'WAITING' }),
      action('e', { status: 'DONE' }),
      action('f', { due: '2026-09-12' }),
    ];
    expect(managementCockpit(s, now).actions.map((x) => x.id)).toEqual(['a', 'd', 'b']);
  });
  it('BOSS excludes overdue previous week and upcoming next week', () => {
    const s = emptyManagement();
    s.actions = [
      action('a', { type: 'BOSS', due: '2026-09-06' }),
      action('b', { type: 'BOSS', due: '2026-09-13' }),
      action('c', { type: 'BOSS', due: '2026-09-14' }),
    ];
    expect(managementCockpit(s, now).boss.map((x) => x.id)).toEqual(['b']);
    expect(weeklyManagement(s, now).boss).toHaveLength(3);
  });
  it('backlog shows overdue and MONITORING today, not NEW today', () => {
    const s = emptyManagement();
    s.problems = [
      problem('a'),
      problem('b', { due: '2026-09-09' }),
      problem('c', { status: 'MONITORING' }),
      problem('d', { status: 'CLOSED', due: '2026-09-01' }),
    ];
    expect(managementCockpit(s, now).problems.map((x) => x.id)).toEqual(['b', 'c']);
  });
  it('requires both conditions at the admission gate', () => {
    const s = emptyManagement(),
      n = structuredClone(s);
    n.problems.push(problem('x'));
    expect(() => validateManagement(n, s, now)).toThrow('условия системности');
    expect(validateManagement(n, s, now, true).problems).toHaveLength(1);
  });
  it('CONTROL requires a decision and cannot be postponed by editing its date', () => {
    const s = emptyManagement();
    s.actions = [action('x', { status: 'CONTROL' })];
    const n = structuredClone(s);
    n.actions[0]!.due = '2026-10-01';
    expect(() => validateManagement(n, s, now)).toThrow('DONE или OPEN');
    n.actions[0]!.status = 'OPEN';
    expect(() => validateManagement(n, s, now)).not.toThrow();
  });
  it('MONITORING requires CLOSED or IN WORK', () => {
    const s = emptyManagement();
    s.problems = [problem('x', { status: 'MONITORING' })];
    const n = structuredClone(s);
    n.problems[0]!.status = 'NEW';
    expect(() => validateManagement(n, s, now)).toThrow('CLOSED или IN WORK');
    n.problems[0]!.status = 'CLOSED';
    expect(() => validateManagement(n, s, now)).not.toThrow();
  });
  it('unrelated changes are allowed while unresolved checks remain visible', () => {
    const s = emptyManagement();
    s.actions = [action('x', { status: 'CONTROL' })];
    const n = structuredClone(s);
    n.actions.push(action('y'));
    expect(() => validateManagement(n, s, now)).not.toThrow();
    expect(managementCockpit(n, now).controls).toHaveLength(1);
  });
  it('TODAY is a reference; source edits are reflected immediately', () => {
    const s = emptyManagement();
    s.actions = [action('x')];
    s.focus = { date: '2026-09-10', refs: [{ area: 'actions', id: 'x' }] };
    s.actions[0]!.title = 'Новый текст';
    expect(managementCockpit(s, now).focus[0]!.row.title).toBe('Новый текст');
    expect(managementCockpit(s, new Date(2026, 8, 11)).focus).toEqual([]);
    expect(s.actions).toHaveLength(1);
  });
  it('does not silently lose unfinished theme actions at day change', () => {
    const s = emptyManagement();
    s.daily = [{ id: 'd', title: 'Тема', date: '2026-09-09', status: 'OPEN', actionId: '' }];
    expect(managementCockpit(s, now).unresolved).toHaveLength(1);
  });
  it('rejects more than 3 TODAY references, duplicates and missing records', () => {
    const s = emptyManagement();
    s.actions = [action('x')];
    s.focus = { date: '2026-09-10', refs: [{ area: 'actions', id: 'missing' }] };
    expect(() => validateManagement(s, null, now)).toThrow('TODAY');
    s.focus.refs = Array.from({ length: 4 }, () => ({ area: 'actions' as const, id: 'x' }));
    expect(() => validateManagement(s, null, now)).toThrow();
  });
  it('rejects impossible dates, empty owners and missing assignees', () => {
    const s = emptyManagement();
    s.actions = [action('x', { due: '2026-02-30' })];
    expect(() => validateManagement(s, null, now)).toThrow();
    s.actions = [action('x', { type: 'ПОРУЧЕНИЕ' })];
    expect(() => validateManagement(s, null, now)).toThrow('исполнителя');
    s.actions = [];
    s.problems = [problem('p', { owner: '' })];
    expect(() => validateManagement(s, null, now)).toThrow();
  });
  it('rejects wrong team scope and incompatible leadership signals', () => {
    const s = emptyManagement();
    s.scopes = [{ id: 'scope', teamId: 't', scope: 'people' }];
    s.signals = [{ id: 'sig', teamId: 't', signal: 'capacity', level: 'Critical', basis: 'Риск' }];
    expect(() => validateManagement(s, null, now)).toThrow('неприменим');
    s.signals = [];
    s.observations = [
      {
        id: 'o',
        teamId: 't',
        employeeId: '',
        person: 'Лид',
        date: '2026-09-10',
        profile: 'Лид',
        signal: 'Расхождение с фактом',
        note: 'Факт',
      },
    ];
    expect(() => validateManagement(s, null, now)).toThrow('профилю');
  });
  it('requires source references to exist', () => {
    const s = emptyManagement();
    s.actions = [action('a', { source: 'problems:missing' })];
    expect(() => validateManagement(s, null, now)).toThrow('Исходная запись');
  });
  it('calendar reads existing actions and quarterly anchors', () => {
    const s = emptyManagement();
    s.actions = [action('a')];
    s.quarters = [
      {
        id: 'q',
        quarter: '2026-Q3',
        approvalDate: '2026-10-01',
        planningDate: '2026-09-08',
        peopleDate: '',
        improvementDate: '',
      },
    ];
    expect(managementEvents(s, 2026, 8).map((x) => x.date)).toEqual(['2026-09-08', '2026-09-10']);
  });
});
