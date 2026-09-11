import { describe, it, expect } from 'vitest';
import { EmployeeSchema } from '@/data/schema';
import { emptyManagement, ManagementSchema } from '@/data/management';
import { deskItems, activeDeskFocus, withStableWorkIds } from '@/domain/workdesk';
import { validateManagement, managementCockpit } from '@/domain/management';
const now = new Date(2026, 8, 10, 9, 15);
const employee = () =>
  EmployeeSchema.parse({
    id: 'e',
    fullName: 'Имя',
    load: {},
    tasks: [
      { id: 'a', text: 'Первая', due: '2026-09-10' },
      { id: 'b', text: 'Вторая', due: '2026-09-10' },
    ],
    development: [{ id: 'd', zone: 'ИПР', deadline: '2026-09-10' }],
    oneOnOne: { nextDate: '2026-09-10' },
  });
describe('Unified workdesk', () => {
  it('preserves original TODAY and accepts mixed references without copies', () => {
    const s = emptyManagement();
    s.actions = [{ id: 'a', title: 'Реестр', type: 'СВОЯ', status: 'OPEN', due: '2026-09-10' }];
    s.focus = {
      date: '2026-09-10',
      refs: [
        { area: 'actions', id: 'a' },
        { area: 'crm', employeeId: 'e', kind: 'task', id: 'b' },
        { area: 'personal', id: 'p' },
      ],
    };
    const parsed = validateManagement(s, null, now);
    expect(parsed.focus).toEqual(s.focus);
    const before = JSON.stringify(s);
    const items = deskItems(
      s,
      [employee()],
      [],
      { todos: [{ id: 'p', text: 'Личная', due: '', done: false }] },
      now,
    );
    expect(activeDeskFocus(s, items, now).map((x) => x.title)).toEqual([
      'Реестр',
      'Вторая',
      'Личная',
    ]);
    expect(managementCockpit(s, now).focus).toHaveLength(1);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('keeps the same task after rename, reorder and deletion of a neighbour', () => {
    const s = emptyManagement(),
      e = employee();
    s.focus = {
      date: '2026-09-10',
      refs: [{ area: 'crm', employeeId: e.id, kind: 'task', id: 'b' }],
    };
    e.tasks.shift();
    e.tasks[0]!.text = 'Новое название';
    expect(activeDeskFocus(s, deskItems(s, [e], [], null, now), now)[0]?.title).toBe(
      'Новое название',
    );
    e.tasks[0]!.status = 'выполнена';
    expect(activeDeskFocus(s, deskItems(s, [e], [], null, now), now)).toEqual([]);
  });
  it('does not redirect a deleted or completed focus to another object', () => {
    const s = emptyManagement(),
      e = employee();
    s.focus = {
      date: '2026-09-10',
      refs: [
        { area: 'crm', employeeId: e.id, kind: 'task', id: 'absent' },
        { area: 'crm', employeeId: e.id, kind: 'meeting', id: '2026-09-09' },
      ],
    };
    expect(activeDeskFocus(s, deskItems(s, [e], [], null, now), now)).toEqual([]);
  });
  it('starts with a fresh focus next day, including CRM records', () => {
    const s = emptyManagement();
    s.focus = {
      date: '2026-09-09',
      refs: [{ area: 'crm', employeeId: 'e', kind: 'task', id: 'b' }],
    };
    expect(activeDeskFocus(s, deskItems(s, [employee()], [], null, now), now)).toEqual([]);
  });
  it('retains max-three and duplicate guards', () => {
    const s = emptyManagement();
    s.focus.refs = Array.from({ length: 4 }, (_, i) => ({
      area: 'personal' as const,
      id: String(i),
    }));
    expect(ManagementSchema.safeParse(s).success).toBe(false);
    s.focus.refs = [
      { area: 'personal', id: 'p' },
      { area: 'personal', id: 'p' },
    ];
    expect(() => validateManagement(s, null, now)).toThrow('TODAY');
  });
  it('does not duplicate CRM task notifications and opens real IPR editor', () => {
    const items = deskItems(emptyManagement(), [employee()], [], null, now);
    expect(items.filter((i) => i.title === 'Первая')).toHaveLength(1);
    expect(items.filter((i) => i.key.startsWith('notice:task'))).toEqual([]);
    expect(items.find((i) => i.title === 'ИПР')?.target.tab).toBe('extra');
  });
  it('upgrades legacy identities without changing content or reassigning IDs', () => {
    const e = employee();
    delete e.tasks[0]!.id;
    delete e.development[0]!.id;
    let n = 0;
    const upgraded = withStableWorkIds(e, () => `id-${++n}`);
    expect(upgraded.tasks[0]).toEqual({ ...e.tasks[0], id: 'id-1' });
    expect(upgraded.tasks[1]?.id).toBe('b');
    expect(upgraded.development[0]?.id).toBe('id-2');
    expect(
      withStableWorkIds(upgraded, () => {
        throw new Error('Must be idempotent');
      }),
    ).toBe(upgraded);
    expect(e.tasks[0]?.id).toBeUndefined();
  });
});
