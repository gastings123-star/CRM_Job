import {
  ManagementSchema,
  type ManagementState,
  type ManagementRow,
  type ManagementArea,
  managementAreas,
} from '../data/management';
export const iso = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export const dayNumber = (s: string) => Date.parse(s + 'T12:00:00Z') / 86400000;
export const shift = (s: string, n: number) =>
  new Date((dayNumber(s) + n) * 86400000).toISOString().slice(0, 10);
export function weekBounds(now: Date): [string, string] {
  const start = shift(iso(now), -((now.getDay() + 6) % 7));
  return [start, shift(start, 6)];
}
export const themes = [
  'Вне рабочего ритма',
  'Delivery',
  'Planning & Backlog',
  'People & Leadership',
  'Decisions & Alignment',
  'Improvement & Closure',
  'Вне рабочего ритма',
];
export function sprintWeek(start: string, now: Date): number | null {
  return start && start <= iso(now)
    ? Math.floor(((dayNumber(iso(now)) - dayNumber(start)) % 21) / 7) + 1
    : null;
}
export function scopeOf(s: ManagementState, teamId: string): string | undefined {
  return s.scopes.find((x) => x.teamId === teamId)?.scope;
}
export function applicable(scope: string | undefined, signal: string): boolean {
  return scope === 'full' || (signal === 'people' ? scope === 'people' : scope === 'delivery');
}
export function managementCockpit(s: ManagementState, now: Date) {
  const today = iso(now),
    tomorrow = shift(today, 1),
    [start, end] = weekBounds(now),
    active = s.actions.filter((x) => x.status !== 'DONE');
  const due = (x: ManagementRow) => (x.status === 'WAITING' ? x.due! <= today : x.due! <= tomorrow);
  return {
    today,
    attention: s.signals
      .filter(
        (x) =>
          applicable(scopeOf(s, x.teamId!), x.signal!) &&
          ['Attention', 'Critical'].includes(x.level!),
      )
      .sort((a, b) => Number(b.level === 'Critical') - Number(a.level === 'Critical')),
    actions: active.filter(due).sort((a, b) => a.due!.localeCompare(b.due!)),
    boss: active.filter(
      (x) =>
        x.type === 'BOSS' &&
        x.due! >= start &&
        x.due! <= end &&
        (x.status !== 'WAITING' || x.due! <= today),
    ),
    problems: s.problems.filter(
      (x) =>
        x.status !== 'CLOSED' && (x.due! < today || (x.status === 'MONITORING' && x.due === today)),
    ),
    controls: active.filter((x) => x.status === 'CONTROL' && x.due! <= today),
    monitoring: s.problems.filter((x) => x.status === 'MONITORING' && x.due! <= today),
    unresolved: s.daily.filter((x) => x.date! < today && x.status === 'OPEN'),
    focus:
      s.focus.date === today
        ? s.focus.refs.flatMap((r) => {
            if (r.area !== 'actions' && r.area !== 'daily') return [];
            const x = s[r.area].find((x) => x.id === r.id);
            return x && !['DONE', 'DISCARDED', 'CONVERTED'].includes(x.status!)
              ? [{ area: r.area, row: x }]
              : [];
          })
        : [],
  };
}
export function weeklyManagement(s: ManagementState, now: Date) {
  const today = iso(now),
    [start] = weekBounds(now);
  return {
    overdue: s.actions.filter((x) => x.status !== 'DONE' && x.due! < today),
    waiting: s.actions.filter((x) => x.status === 'WAITING'),
    boss: s.actions.filter((x) => x.type === 'BOSS' && x.status !== 'DONE'),
    controls: s.actions.filter(
      (x) => x.status === 'CONTROL' && x.due! >= shift(start, 7) && x.due! <= shift(start, 13),
    ),
    problems: s.problems.filter(
      (x) =>
        x.status !== 'CLOSED' &&
        (x.due! < today || (x.status === 'MONITORING' && x.due! <= shift(start, 13))),
    ),
  };
}
export function validateManagement(
  raw: unknown,
  old: ManagementState | null,
  now: Date,
  gate = false,
): ManagementState {
  const parsed = ManagementSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('\n'));
  const s = parsed.data as ManagementState,
    today = iso(now);
  const fail = (text: string): never => {
    throw new Error(text);
  };
  for (const area of managementAreas) {
    const ids = new Set<string>();
    for (const x of s[area]) {
      if (ids.has(x.id)) fail('Повторный идентификатор записи');
      ids.add(x.id);
    }
  }
  for (const area of ['signals', 'planning', 'people', 'improvements', 'observations'] as const)
    for (const x of s[area]) {
      const scope = scopeOf(s, x.teamId!);
      if (!scope) fail('Настройте границы ответственности команды в Rhythm');
      if ((area === 'planning' || area === 'improvements') && scope === 'people')
        fail('Этот контур не применяется к People-only команде');
      if (area === 'people' && scope === 'delivery')
        fail('People Loop не применяется к Delivery-only команде');
      if (area === 'signals' && !applicable(scope, x.signal!)) fail('Сигнал неприменим к команде');
      if (area === 'observations' && scope === 'people' && x.profile === 'Лид')
        fail('People-only: фиксируйте управление людьми DPO, не технический delivery');
    }
  for (const [area, keys] of [
    ['signals', ['teamId', 'signal']],
    ['planning', ['teamId', 'quarter']],
    ['scopes', ['teamId']],
    ['quarters', ['quarter']],
  ] as [ManagementArea, string[]][]) {
    const seen = new Set<string>();
    for (const x of s[area]) {
      const key = JSON.stringify(keys.map((k) => x[k]));
      if (seen.has(key)) fail('Такая запись уже существует — измените её');
      seen.add(key);
    }
  }
  for (const x of s.actions)
    if (x.source) {
      const [area, id] = x.source.split(':');
      if (
        !managementAreas.includes(area as ManagementArea) ||
        !s[area as ManagementArea].some((r) => r.id === id)
      )
        fail('Исходная запись действия не найдена');
    }
  for (const x of s.daily)
    if (x.status === 'CONVERTED' && !s.actions.some((r) => r.id === x.actionId))
      fail('Не найдено действие, перенесённое в Реестр');
  const refs = new Set<string>();
  for (const r of s.focus.refs) {
    const key =
      r.area === 'crm' ? `${r.area}:${r.employeeId}:${r.kind}:${r.id}` : `${r.area}:${r.id}`;
    if (
      ((r.area === 'actions' || r.area === 'daily') && !s[r.area].some((x) => x.id === r.id)) ||
      refs.has(key)
    )
      fail('Некорректная ссылка TODAY');
    refs.add(key);
  }
  if (old) {
    for (const x of s.problems)
      if (!old.problems.some((r) => r.id === x.id) && !gate)
        fail('Подтвердите оба обязательных условия системности');
    for (const [area, intermediate, allowed] of [
      ['actions', 'CONTROL', ['DONE', 'OPEN']],
      ['problems', 'MONITORING', ['CLOSED', 'IN WORK']],
    ] as [ManagementArea, string, string[]][]) {
      for (const x of s[area]) {
        const prev = old[area].find((r) => r.id === x.id);
        if (JSON.stringify(x) === JSON.stringify(prev)) continue;
        if (
          (x.status === intermediate && x.due! <= today) ||
          (prev?.status === intermediate && prev.due! <= today && !allowed.includes(x.status!))
        )
          fail(`${intermediate}: дата проверки наступила. Выберите ${allowed.join(' или ')}`);
      }
    }
  }
  return s;
}
export function managementEvents(s: ManagementState, year: number, month: number) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  return [
    ...s.quarters.flatMap((x) =>
      ['approvalDate', 'planningDate', 'peopleDate', 'improvementDate'].map((key, i) => ({
        id: x.id + key,
        date: x[key]!,
        label: `${['Утверждение backlog', 'Planning Review', 'People Review', 'Improvement Review'][i]} · ${x.quarter}`,
        area: 'rhythm',
      })),
    ),
    ...s.actions
      .filter((x) => x.status !== 'DONE')
      .map((x) => ({ id: x.id, date: x.due!, label: `${x.type}: ${x.title}`, area: 'actions' })),
    ...s.problems
      .filter((x) => x.status === 'MONITORING')
      .map((x) => ({
        id: x.id,
        date: x.due!,
        label: `Проверка эффекта: ${x.title}`,
        area: 'problems',
      })),
  ]
    .filter((x) => x.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date));
}
