import { describe, expect, it } from 'vitest';
import { emptyManagement } from '@/data/management';
import { EmployeeSchema } from '@/data/schema';
import { recordMeeting, type MeetingInput } from '@/domain/meeting-summary';
import { validateManagement } from '@/domain/management';
import { deskItems } from '@/domain/workdesk';
import { dayChecks } from '@/domain/day-checks';
import { workspaceParent } from '@/ui/hooks/useWorkspaceBack';
const now = new Date(2026, 8, 11, 7, 30);
const input: MeetingInput = {
  id: 'm',
  title: 'Перевод',
  date: '2026-09-11',
  participants: 'Участники',
  decision: 'Согласовать условия',
  sourceActionId: '',
  closeSource: false,
  followUps: [],
};
describe('Pilot fixes', () => {
  it('offers explicit checks even before work and with no actions', () => {
    const checks = dayChecks([], now);
    expect(checks).toHaveLength(3);
    expect(checks[0]?.instruction).toContain('вручную');
    expect(checks[1]?.title).toBe('Разобрать исключения недели');
    expect(checks.every((c) => c.items.length === 0)).toBe(true);
  });
  it('creates a meeting result without creating obligations by default', () => {
    const state = emptyManagement(),
      copy = JSON.stringify(state);
    const result = recordMeeting(state, input, () => {
      throw Error('No IDs needed');
    });
    expect(result.meetingNotes).toHaveLength(1);
    expect(result.actions).toEqual([]);
    expect(JSON.stringify(state)).toBe(copy);
    expect(validateManagement(result, state, now).meetingNotes).toHaveLength(1);
  });
  it('links existing actions without duplicates and closes source only explicitly', () => {
    const state = emptyManagement();
    state.actions = [
      { id: 'a', title: 'Встреча', type: 'СВОЯ', due: '2026-09-11', status: 'OPEN' },
      { id: 'b', title: 'Существующее действие', type: 'СВОЯ', due: '2026-09-12', status: 'OPEN' },
    ];
    const result = recordMeeting(
      state,
      {
        ...input,
        sourceActionId: 'a',
        closeSource: true,
        followUps: [
          { existingId: 'b', title: '', due: '', assignee: '' },
          {
            existingId: '',
            title: 'Проверить оформление',
            due: '2026-09-15',
            assignee: 'Ответственный',
          },
        ],
      },
      () => 'new',
    );
    expect(result.actions).toHaveLength(3);
    expect(result.actions[0]?.status).toBe('DONE');
    expect(result.actions[2]?.type).toBe('ПОРУЧЕНИЕ');
    expect(result.actions[2]?.meetingId).toBe('m');
    expect(result.meetingNotes?.[0]?.actionIds).toEqual(['b', 'new']);
    expect(validateManagement(result, state, now).actions).toHaveLength(3);
    expect(() => recordMeeting(result, input, () => 'other')).toThrow('уже сохранён');
    expect(state.actions[0]?.status).toBe('OPEN');
  });
  it('rejects incomplete follow-up without modifying source', () => {
    const state = emptyManagement();
    expect(() =>
      recordMeeting(
        state,
        { ...input, followUps: [{ title: 'Дело', due: '', assignee: '', existingId: '' }] },
        () => 'x',
      ),
    ).toThrow('дату');
    expect(state.meetingNotes).toEqual([]);
    expect(state.actions).toEqual([]);
  });
  it('sorts Critical ahead of a normal meeting today without auto focus', () => {
    const state = emptyManagement();
    state.scopes = [{ id: 'sc', teamId: 't', scope: 'full' }];
    state.signals = [
      {
        id: 'critical',
        teamId: 't',
        signal: 'people',
        level: 'Critical',
        basis: 'Нужно вмешательство',
      },
    ];
    const employee = EmployeeSchema.parse({
      id: 'e',
      load: {},
      oneOnOne: { nextDate: '2026-09-11' },
    });
    const items = deskItems(state, [employee], [], null, now);
    expect(items.findIndex((i) => i.key === 'signal:critical')).toBeLessThan(
      items.findIndex((i) => i.ref?.area === 'crm' && i.ref.kind === 'meeting'),
    );
    expect(state.focus.refs).toEqual([]);
  });
  it('has safe parents for direct internal links', () => {
    expect(workspaceParent('/')).toBe('/');
    expect(workspaceParent('/crm/e')).toBe('/crm');
    expect(workspaceParent('/teams/t')).toBe('/teams');
    expect(workspaceParent('/crm')).toBe('/overview');
    expect(workspaceParent('/overview')).toBe('/');
  });
});
