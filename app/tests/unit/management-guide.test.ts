import { describe, expect, it } from 'vitest';
import { emptyManagement } from '@/data/management';
import { EmployeeSchema } from '@/data/schema';
import { dueGuide, guideNow, workDay } from '@/domain/management-guide';
const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute);
describe('Unified work guide', () => {
  it.each([
    [9, 0, 'Разобрать входящие'],
    [9, 15, 'Выбрать фокус дня'],
    [9, 25, 'Decisions & Alignment'],
    [16, 30, 'Эскалации и согласования'],
  ])('selects the slot at %s:%s', (h, m, title) => {
    expect(guideNow(emptyManagement(), at(10, Number(h), Number(m))).current?.title).toBe(title);
  });
  it('does not stretch a block into meeting time or after work', () => {
    expect(guideNow(emptyManagement(), at(10, 11)).current).toBeUndefined();
    expect(guideNow(emptyManagement(), at(10, 17)).current).toBeUndefined();
    expect(guideNow(emptyManagement(), at(10, 11)).next.start).toBe(990);
  });
  it('keeps Friday 50 + 45 minutes and skips weekends', () => {
    const s = emptyManagement();
    expect(guideNow(s, at(11, 10, 14)).current?.title).toBe('Backlog по исключениям');
    expect(guideNow(s, at(11, 10, 15)).current?.title).toBe('Закрытие недели');
    expect(workDay(s, at(12, 10))).toEqual([]);
    expect(guideNow(s, at(11, 17)).nextDate).toBe('2026-09-14');
  });
  it('uses quarter dates inside the existing block and surfaces collisions', () => {
    const s = emptyManagement();
    s.quarters = [{ id: 'q', planningDate: '2026-09-10', peopleDate: '2026-09-10' }];
    const guide = guideNow(s, at(10, 10));
    expect(guide.current?.title).toBe('Planning Review · People Review');
    expect(guide.current?.detail).toContain('Разведите даты');
    expect(guide.slots.filter((x) => x.start === 565)).toHaveLength(1);
  });
  it('projects CRM deadlines and links without creating duplicate actions', () => {
    const s = emptyManagement();
    const e = EmployeeSchema.parse({
      id: 'e',
      fullName: 'Тест',
      load: {},
      oneOnOne: { nextDate: '2026-09-10' },
      tasks: [
        { text: 'Открыта', due: '2026-09-09' },
        { text: 'Готово', due: '2026-09-09', status: 'выполнена' },
      ],
      development: [{ zone: 'ИПР', deadline: '2026-09-11' }],
    });
    const personal = {
      todos: [
        { text: 'Личная', due: '2026-09-10', done: false },
        { text: 'Завершена', due: '2026-09-10', done: true },
      ],
    };
    const before = JSON.stringify({ s, e, personal });
    const items = dueGuide(s, [e], personal, at(10, 10));
    expect(items).toHaveLength(4);
    expect(items[0]?.id).toBe('task:e:0');
    expect(items.find((x) => x.id === 'meeting:e')?.target.tab).toBe('oneonone');
    expect(JSON.stringify({ s, e, personal })).toBe(before);
    e.tasks[0]!.status = 'выполнена';
    expect(dueGuide(s, [e], personal, at(10, 10))).toHaveLength(3);
  });
  it('does not nag about closed actions, future waiting checks or historical reviews', () => {
    const s = emptyManagement();
    s.actions = [
      { id: 'done', status: 'DONE', due: '2026-09-09' },
      { id: 'waiting', status: 'WAITING', due: '2026-09-11' },
    ];
    s.quarters = [{ id: 'old', peopleDate: '2026-09-09' }];
    expect(dueGuide(s, [], null, at(10, 10))).toEqual([]);
  });
});
