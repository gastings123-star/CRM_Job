import type { Employee, Team } from '@/data/schema';
import type { FocusRef, ManagementState } from '@/data/management';
import { iso, shift, managementCockpit } from './management';
import { buildNotifications } from './notifications';
import type { GuideTarget } from './management-guide';

export interface DeskItem {
  key: string;
  title: string;
  source: string;
  reason: string;
  date: string;
  priority: number;
  attention: boolean;
  target: GuideTarget & { recordId?: string };
  ref?: FocusRef;
  sourceIndex?: number;
  needsId?: boolean;
}
export interface DeskTodo {
  id: string;
  text: string;
  due: string;
  done: boolean;
  index: number;
}
export function personalTodos(raw: unknown): DeskTodo[] {
  if (!raw || typeof raw !== 'object' || !('todos' in raw) || !Array.isArray(raw.todos)) return [];
  return (raw.todos as unknown[]).flatMap((value, index) => {
    if (!value || typeof value !== 'object') return [];
    const t = value as Record<string, unknown>;
    return [
      {
        id: typeof t.id === 'string' ? t.id : '',
        text: typeof t.text === 'string' ? t.text : '',
        due: typeof t.due === 'string' ? t.due : '',
        done: t.done === true,
        index,
      },
    ];
  });
}
export function focusKey(ref: FocusRef): string {
  return ref.area === 'crm'
    ? `crm:${ref.employeeId}:${ref.kind}:${ref.id}`
    : `${ref.area}:${ref.id}`;
}
export function deskItems(
  s: ManagementState,
  employees: Employee[],
  teams: Team[],
  personal: unknown,
  now: Date,
): DeskItem[] {
  const today = iso(now),
    tomorrow = shift(today, 1),
    items: DeskItem[] = [];
  const reason = (date: string) =>
    !date
      ? 'Без срока'
      : date < today
        ? `Срок прошёл · ${date}`
        : date === today
          ? 'Срок сегодня'
          : date === tomorrow
            ? 'Срок завтра'
            : `Срок ${date}`;
  const due = (date: string) => !!date && date <= tomorrow;
  const add = (item: DeskItem) => items.push(item);
  for (const a of s.actions.filter((a) => a.status !== 'DONE')) {
    const ref: FocusRef = { area: 'actions', id: a.id },
      date = a.due ?? '';
    add({
      key: focusKey(ref),
      ref,
      title: a.title!,
      source: a.type === 'ПОРУЧЕНИЕ' ? 'Поручение · Реестр' : 'Реестр',
      date,
      reason:
        a.status === 'WAITING'
          ? `Следующий контроль · ${date}`
          : a.status === 'CONTROL'
            ? `Проверить результат · ${date}`
            : reason(date),
      priority: a.type === 'BOSS' && due(date) ? 0 : date < today ? 2 : 3,
      attention: a.status === 'WAITING' ? date <= today : due(date),
      target: { route: 'management', area: 'actions', recordId: a.id },
    });
  }
  for (const d of s.daily.filter((d) => d.status === 'OPEN')) {
    const ref: FocusRef = { area: 'daily', id: d.id };
    add({
      key: focusKey(ref),
      ref,
      title: d.title!,
      source: 'Действие по теме дня',
      date: d.date!,
      reason: d.date! < today ? 'Осталось незавершённое действие' : 'Выбрано по теме дня',
      priority: 5,
      attention: d.date! <= today,
      target: { route: 'management', area: 'rhythm', recordId: d.id },
    });
  }
  for (const e of employees) {
    const employeeTarget = (tab: string): GuideTarget => ({ route: 'crm', employeeId: e.id, tab });
    e.tasks.forEach((task, index) => {
      if (task.status === 'выполнена') return;
      const ref: FocusRef = {
        area: 'crm',
        employeeId: e.id,
        kind: 'task',
        id: task.id ?? `legacy-${index}`,
      };
      add({
        key: focusKey(ref),
        ref,
        sourceIndex: index,
        needsId: !task.id,
        title: task.text || 'Задача без названия',
        source: `Задача · ${e.fullName}`,
        date: task.due,
        reason: reason(task.due),
        priority: task.due && task.due < today ? 2 : 3,
        attention: due(task.due),
        target: employeeTarget('tasks'),
      });
    });
    e.development.forEach((dev, index) => {
      if (dev.status === 'выполнено') return;
      const ref: FocusRef = {
        area: 'crm',
        employeeId: e.id,
        kind: 'development',
        id: dev.id ?? `legacy-${index}`,
      };
      add({
        key: focusKey(ref),
        ref,
        sourceIndex: index,
        needsId: !dev.id,
        title: dev.zone || 'ИПР без названия',
        source: `ИПР · ${e.fullName}`,
        date: dev.deadline,
        reason: reason(dev.deadline),
        priority: 4,
        attention: due(dev.deadline),
        target: employeeTarget('extra'),
      });
    });
    if (e.oneOnOne.nextDate) {
      const date = e.oneOnOne.nextDate,
        ref: FocusRef = { area: 'crm', employeeId: e.id, kind: 'meeting', id: date };
      add({
        key: focusKey(ref),
        ref,
        title: `1-on-1 · ${e.fullName}`,
        source: 'Встреча',
        date,
        reason:
          date < today
            ? `Проверить прошедшую встречу · ${date}`
            : `Подготовить встречу · ${date} · время не задано`,
        priority: date === today ? 1 : 4,
        attention: due(date),
        target: employeeTarget('oneonone'),
      });
    }
  }
  for (const t of personalTodos(personal).filter((t) => !t.done)) {
    const ref: FocusRef = { area: 'personal', id: t.id || `legacy-${t.index}` };
    add({
      key: focusKey(ref),
      ref,
      needsId: !t.id,
      sourceIndex: t.index,
      title: t.text || 'Личная задача',
      source: 'Личная задача',
      date: t.due,
      reason: reason(t.due),
      priority: t.due && t.due < today ? 2 : 3,
      attention: due(t.due),
      target: { route: 'personal' },
    });
  }
  for (const p of s.problems.filter((p) => p.status !== 'CLOSED'))
    add({
      key: `problem:${p.id}`,
      title: p.title!,
      source: 'Системная проблема',
      date: p.due!,
      reason: p.status === 'MONITORING' ? `Проверка эффекта · ${p.due}` : reason(p.due!),
      priority: 2,
      attention: p.due! <= today,
      target: { route: 'management', area: 'problems', recordId: p.id },
    });
  for (const signal of managementCockpit(s, now).attention)
    add({
      key: `signal:${signal.id}`,
      title: signal.basis!,
      source: `Сигнал · ${teams.find((t) => t.id === signal.teamId)?.name ?? 'Команда'}`,
      date: '',
      reason: `${signal.level} · проверить основание, затем принять решение`,
      priority: signal.level === 'Critical' ? 0.5 : 4,
      attention: true,
      target: { route: 'management', area: 'signals', recordId: signal.id },
    });
  // Task, IPR and dated meeting reminders are already represented above.
  for (const n of buildNotifications(employees, now).filter(
    (n) =>
      !['tasks', 'skills'].includes(n.tab) &&
      (n.tab !== 'onetoone' || !employees.find((e) => e.id === n.empId)?.oneOnOne.nextDate),
  )) {
    add({
      key: `notice:${n.id}`,
      title: n.text,
      source: `CRM · ${n.employee}`,
      date: '',
      reason: 'Сигнал CRM · проверить в карточке, не автоматическое поручение',
      priority: n.color === 'red' ? 2 : 5,
      attention: true,
      target: {
        route: 'crm',
        employeeId: n.empId,
        tab: n.tab === 'onetoone' ? 'oneonone' : n.tab === 'main' ? 'basic' : n.tab,
      },
    });
  }
  for (const q of s.quarters)
    for (const [key, area, title] of [
      ['planningDate', 'planning', 'Подготовить квартальный план'],
      ['peopleDate', 'people', 'Разобрать кадровые исключения'],
      ['improvementDate', 'improvements', 'Проверить улучшения'],
      ['approvalDate', 'planning', 'Утверждение квартального плана'],
    ] as const) {
      const date = q[key];
      if (date && date >= today)
        add({
          key: `quarter:${q.id}:${key}`,
          title,
          source: q.quarter!,
          date,
          reason: `Квартальный разбор · ${date}`,
          priority: 3,
          attention: due(date),
          target: { route: 'management', area },
        });
    }
  return items.sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.date || '9999').localeCompare(b.date || '9999') ||
      a.key.localeCompare(b.key),
  );
}
export function activeDeskFocus(s: ManagementState, items: DeskItem[], now: Date): DeskItem[] {
  if (s.focus.date !== iso(now)) return [];
  return s.focus.refs.flatMap((ref) => {
    const item = items.find((i) => i.ref && focusKey(i.ref) === focusKey(ref) && !i.needsId);
    return item ? [item] : [];
  });
}

/** Add identities only; preserve every business field and existing identity. */
export function withStableWorkIds(employee: Employee, makeId: () => string): Employee {
  if (employee.tasks.every((t) => t.id) && employee.development.every((d) => d.id)) return employee;
  return {
    ...employee,
    tasks: employee.tasks.map((t) => (t.id ? t : { ...t, id: makeId() })),
    development: employee.development.map((d) => (d.id ? d : { ...d, id: makeId() })),
  };
}
