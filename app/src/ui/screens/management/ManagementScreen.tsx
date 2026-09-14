import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@/ui/components/Button';
import { Modal, type ModalProps } from '@/ui/components/Modal';
import { Field, TextInput, TextArea } from '@/ui/components/Field';
import { confirm, toast } from '@/state/ui';
import { employeesRepo, teamsRepo, personalRepo } from '@/infra/repos';
import { managementRepo } from '@/infra/repos/management';
import { routes, employeeUrl, teamUrl } from '@/app/routes';
import {
  managementAreas,
  managementSchemas,
  categories,
  peopleCategories,
  improvementExceptions,
  signalDefinitions,
  type ManagementArea,
  type ManagementRow,
} from '@/data/management';
import {
  iso,
  dayNumber,
  themes,
  sprintWeek,
  applicable,
  scopeOf,
  managementCockpit,
  weeklyManagement,
} from '@/domain/management';
import spec from './Management_OS_v0.md?raw';
import crmRhythmSpec from '../../../../../docs/management-crm-rhythm.md?raw';
import { LocalBackup } from './LocalBackup';
import { getSession } from '@/infra/auth';
import { LOCAL_MODE } from '@/infra/local-mode';
import { WorkGuide, CrmRhythm } from './WorkGuide';
const statusLabels: Record<string, string> = {
  OPEN: 'В работе',
  WAITING: 'Жду ответа',
  CONTROL: 'Проверить результат',
  DONE: 'Готово',
};
const displayText = (...values: (string | undefined)[]) =>
  values.find((value) => value?.trim()) ?? '';
export const titles: Record<string, string> = {
  cockpit: 'Cockpit',
  actions: 'Управленческий реестр',
  problems: 'Management Backlog',
  signals: 'Team Scorecard',
  observations: 'DPO / Lead Accountability',
  planning: 'Planning Loop',
  people: 'People Loop',
  improvements: 'Improvement Loop',
  rhythm: 'Rhythm',
  review: 'Weekly Review',
  reference: 'Спецификация',
  data: 'Данные',
  daily: 'Действие по теме дня',
  quarters: 'Квартальные даты',
  scopes: 'Границы ответственности',
  sprint: 'Начало спринта',
};
const activityGroups = [
  { title: 'Каждый день', areas: ['cockpit', 'actions'] },
  { title: 'Каждую неделю', areas: ['signals', 'review'] },
  { title: 'По событию', areas: ['problems', 'observations'] },
  { title: 'Раз в квартал · по исключениям', areas: ['planning', 'people', 'improvements'] },
  { title: 'Ритм и справка', areas: ['rhythm', 'reference', 'data'] },
];
const activities: Record<string, { purpose: string; cadence: string; summary: string }> = {
  cockpit: {
    summary: 'Выбрать главное на сегодня',
    purpose:
      'Помогает выбрать три действия на сегодня и увидеть, где нужно ваше вмешательство. Показывает записи из остальных разделов без дублирования.',
    cadence: 'Каждый день · 09:15–09:25',
  },
  actions: {
    summary: 'Держать обещания и поручения под контролем',
    purpose:
      'Хранит действия, поручения и ожидания, требующие вашего личного контроля, чтобы договорённости не терялись.',
    cadence: 'По ходу дня · запись после события, без отдельного слота',
  },
  signals: {
    summary: 'Видеть состояние команд',
    purpose:
      'Собирает факты и сигналы о командах, чтобы понять, где нужна проверка или помощь. Сигнал сам по себе не создаёт задачу.',
    cadence: 'Факты — по понедельникам · сигналы — на синке недели 1 и при эскалации',
  },
  review: {
    summary: 'Проверить проблемы и обязательства',
    purpose:
      'Помогает завершить неделю: разобрать исключения в системных проблемах и актуализировать личные обязательства в Реестре.',
    cadence: 'По пятницам · 09:25–11:00, внутри утреннего блока',
  },
  problems: {
    summary: 'Устранять причины повторяющихся сбоев',
    purpose:
      'Хранит системные проблемы, для решения которых нужно менять процесс, правила или механизм. Конкретные действия по ним ведутся в Реестре.',
    cadence: 'При выявлении проблемы · обзор по исключениям в пятницу',
  },
  observations: {
    summary: 'Опираться на факты в разговоре с лидом',
    purpose:
      'Сохраняет наблюдения об ответственности DPO и лидов, чтобы обсуждать повторяющиеся паттерны на основе фактов, а не впечатлений.',
    cadence: 'По событию · во время контактов и командных синков',
  },
  planning: {
    summary: 'Подготовить квартальный план к утверждению',
    purpose:
      'Помогает проверить готовность и реализуемость квартального плана перед коллегиальным утверждением.',
    cadence: 'Раз в квартал · до внешнего утверждения плана',
  },
  people: {
    summary: 'Принять решения по людям',
    purpose:
      'Собирает кадровые исключения, требующие вашего решения. Если исключений нет, заполнять раздел не нужно.',
    cadence: 'Квартальный разбор исключений · текущие сигналы — по событию',
  },
  improvements: {
    summary: 'Выбрать улучшения для команды',
    purpose:
      'Фиксирует 1–3 утверждённые темы улучшений на команду. Помогает разбирать исключения, пока исполнение контролирует Scrum Master.',
    cadence: 'Темы — раз в квартал · ваше вмешательство — по исключениям',
  },
  rhythm: {
    summary: 'Свериться с ритмом и настроить даты',
    purpose:
      'Показывает, когда выполняется управленческая работа, и хранит опорные даты спринта и квартала. Сам ритм не требует ежедневного заполнения.',
    cadence: 'Справка — по необходимости · даты — при изменении',
  },
  reference: {
    summary: 'Проверить согласованные правила',
    purpose:
      'Содержит исходную спецификацию Management OS v0 для сверки правил и границ ответственности.',
    cadence: 'При возникновении вопросов',
  },
  data: {
    summary: 'Сохранить или восстановить данные',
    purpose: 'Позволяет выгрузить локальные данные и восстановить их из резервной копии.',
    cadence: 'При переносе или восстановлении данных',
  },
};
const hints: Record<string, string> = {
  actions:
    'Запишите, что нужно сделать и когда проверить результат. «Жду ответа» — укажите дату следующего контроля. После выполнения отметьте «Готово».',
  problems:
    'Системная проблема хранится здесь, действие по ней — в Реестре. MONITORING после даты проверки → CLOSED или IN WORK.',
  signals:
    'Факты — по понедельникам. Сигналы DPO — на синке недели 1 или при эскалации; не «протухают» автоматически. Цвет не создаёт работу.',
  observations:
    'Журнал фактов, без owner, срока, статуса и баллов. Паттерн, а не единичный случай, — основание для вашего решения о разговоре. Для People-only команд — только управление людьми, сравнение с альтернативным каналом.',
  planning:
    'DPO отвечает за readiness, лид — за техническую реализуемость. Включение в квартальный backlog утверждают боссы вместе с DPO. Это отдельный квартальный результат, не сигнал Scorecard.',
  people:
    'Оценка — DPO, кадровое решение — Дмитрий. Только реальные исключения: ответ «нет» не создаёт строку. Это конфиденциальный контур, не общая квартальная встреча.',
  improvements:
    '1–3 темы на команду. DPO + Scrum Master предлагают, Дмитрий утверждает. Исполняет назначенный owner; контролирует Scrum Master. Дмитрий разбирает исключения, не ведёт еженедельный task tracker.',
  rhythm:
    'Спринтовый ритм и календарный квартал независимы. Тема дня — самостоятельная работа, не повестка встреч.',
  review:
    'Пятница: 09:25–10:15 Backlog по исключениям; 10:15–11:00 Реестр. Систематическое превышение 95 минут — повод искать перегрузку системы.',
};
interface FormField {
  key: string;
  label: string;
  type?: string;
  options?: readonly string[];
  optional?: boolean;
}
const f = (
  key: string,
  label: string,
  type = 'text',
  options?: readonly string[],
  optional = false,
): FormField => ({ key, label, type, ...(options ? { options } : {}), optional });
function fields(area: string, row: ManagementRow): FormField[] {
  const team = f('teamId', 'Команда', 'team'),
    quarter = f('quarter', 'Квартал (2026-Q3)'),
    person = [
      f('employeeId', 'Сотрудник CRM', 'employee', undefined, true),
      f('person', 'Имя, если человека нет в CRM', 'text', undefined, true),
    ];
  const defs: Record<string, FormField[]> = {
    actions: [
      f('title', 'Действие', 'textarea'),
      f('type', 'Тип', 'select', ['СВОЯ', 'ПОРУЧЕНИЕ', 'BOSS', 'CONTROL']),
      f(
        'due',
        row.status === 'WAITING' ? 'Дата следующего контроля' : 'Срок / дата контроля',
        'date',
      ),
      f('status', 'Статус', 'select', ['OPEN', 'WAITING', 'CONTROL', 'DONE']),
      ...(row.type === 'ПОРУЧЕНИЕ'
        ? [
            f('employeeId', 'Исполнитель из CRM', 'employee', undefined, true),
            f('assignee', 'Исполнитель вне CRM', 'text', undefined, true),
          ]
        : []),
      f('teamId', 'Связь с командой', 'team', undefined, true),
    ],
    problems: [
      f('title', 'Проблема', 'textarea'),
      f('contour', 'Команда / контур'),
      f('teamId', 'Связь с командой CRM', 'team', undefined, true),
      f('category', 'Категория', 'select', categories),
      f('owner', 'Owner'),
      f('due', 'Срок / дата проверки эффекта', 'date'),
      f('criterion', 'Критерий закрытия', 'textarea'),
      f('status', 'Статус', 'select', ['NEW', 'IN WORK', 'MONITORING', 'CLOSED']),
    ],
    signals: [
      f('level', 'Состояние', 'select', ['Green', 'Attention', 'Critical']),
      f('basis', 'Факт / основание оценки', 'textarea'),
    ],
    observations: [
      f('date', 'Дата наблюдения', 'date'),
      ...person,
      team,
      f('profile', 'Профиль', 'select', ['DPO', 'Лид']),
      f(
        'signal',
        'Сигнал',
        'select',
        row.profile === 'Лид'
          ? ['Без решения', 'Поздняя эскалация', 'Риск выявлен извне']
          : ['Без решения', 'Расхождение с фактом', 'Поздняя эскалация'],
      ),
      f('note', 'Кратко: что произошло', 'textarea'),
    ],
    planning: [
      quarter,
      team,
      f('requirements', 'Доля с согласованными требованиями'),
      f('estimate', 'Доля с оценкой трудозатрат'),
      f('dependencies', 'Зависимости — известны и разрешены', 'textarea'),
      f('feasibility', 'Техническая реализуемость — подтверждение лида', 'textarea'),
      f('capacity', 'Capacity — достаточность под обязательства', 'textarea'),
      f('readiness', 'Readiness квартала', 'select', ['Ready', 'Risk', 'Not ready']),
      f('risk', 'Основание риска', 'textarea', undefined, row.readiness === 'Ready'),
    ],
    people: [
      quarter,
      team,
      ...person,
      f('category', 'Категория исключения', 'select', peopleCategories),
      f('note', 'Риск / основание со слов DPO', 'textarea'),
    ],
    improvements: [
      quarter,
      team,
      f('title', 'Тема улучшения', 'textarea'),
      f('owner', 'Owner исполнения'),
      f('approval', 'Решение Дмитрия', 'select', [
        'На рассмотрении',
        'Утверждено',
        'Вернуть на доработку',
      ]),
      f('exception', 'Исключение', 'select', improvementExceptions),
      f(
        'outcome',
        'Итог квартала / основание исключения',
        'textarea',
        undefined,
        row.exception === 'Нет исключения',
      ),
    ],
    quarters: [
      quarter,
      f('approvalDate', 'Внешнее утверждение backlog', 'date', undefined, true),
      f('planningDate', 'Planning Review · вторник', 'date', undefined, true),
      f('peopleDate', 'People Review · среда', 'date', undefined, true),
      f('improvementDate', 'Improvement Review · пятница', 'date', undefined, true),
    ],
    daily: [
      f('title', 'Разовое действие', 'textarea'),
      f('date', 'День', 'date'),
      f('status', 'Результат', 'select', ['OPEN', 'DONE', 'DISCARDED']),
    ],
    scopes: [team, f('scope', 'Ответственность', 'select', ['full', 'delivery', 'people'])],
    sprint: [f('sprintStart', 'Начало трёхнедельного цикла', 'date')],
  };
  return defs[area] ?? [];
}
const scopeLabel: Record<string, string> = {
  full: 'Delivery + People',
  delivery: 'Только Delivery',
  people: 'Только People',
};
const defaultRow = (area: string, now: Date): ManagementRow => ({
  id: '',
  ...(area === 'actions'
    ? { type: 'СВОЯ', status: 'OPEN', assignee: '', employeeId: '', teamId: '', source: '' }
    : {}),
  ...(area === 'problems' ? { category: 'Delivery', status: 'NEW', teamId: '' } : {}),
  ...(['planning', 'people', 'improvements', 'quarters'].includes(area)
    ? { quarter: `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}` }
    : {}),
  ...(area === 'observations'
    ? { profile: 'DPO', date: iso(now), employeeId: '', person: '' }
    : {}),
  ...(area === 'people' ? { employeeId: '', person: '' } : {}),
  ...(area === 'improvements'
    ? { approval: 'На рассмотрении', exception: 'Нет исключения', outcome: '' }
    : {}),
  ...(area === 'daily' ? { date: iso(now), status: 'OPEN', actionId: '' } : {}),
  ...(area === 'quarters'
    ? { approvalDate: '', planningDate: '', peopleDate: '', improvementDate: '' }
    : {}),
});
export function ManagementBadge({ value }: { value: string | undefined }) {
  return (
    <span
      class={`inline-block rounded-md px-2 py-1 text-xs font-medium ${['Critical', 'Not ready'].includes(value ?? '') ? 'bg-red-500/15 text-red-300' : ['Attention', 'Risk', 'CONTROL', 'MONITORING'].includes(value ?? '') ? 'bg-amber-500/15 text-amber-200' : ['Green', 'Ready', 'DONE', 'CLOSED'].includes(value ?? '') ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/40 text-slate-300'}`}
    >
      {statusLabels[value ?? ''] ?? value ?? 'Не оценено'}
    </span>
  );
}
function Box({
  title,
  children,
  action,
}: {
  title: string;
  children: ComponentChildren;
  action?: ComponentChildren;
}) {
  return (
    <section class="mos-panel">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 class="font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
function Empty({
  text,
  action,
  onClick,
}: {
  text: string;
  action?: string | undefined;
  onClick?: () => void;
}) {
  return (
    <div class="py-8 text-center">
      <p class="mb-4 text-sm text-slate-400">{text}</p>
      {action && (
        <Button variant="secondary" onClick={onClick}>
          {action}
        </Button>
      )}
    </div>
  );
}
function EditorSurface({ inline, ...props }: ModalProps & { inline: boolean }) {
  if (!inline) return <Modal {...props} />;
  if (!props.open) return null;
  return (
    <section
      aria-label="Редактор управленческой записи"
      class="rounded-xl border border-white/10 p-4"
    >
      <div class="mb-4 flex items-center justify-between gap-3">
        <h3 class="text-lg font-semibold">{props.title}</h3>
        <button class="text-sm text-slate-400" onClick={props.onClose}>
          Закрыть ×
        </button>
      </div>
      {props.children}
    </section>
  );
}
export function ManagementScreen({ embedded = false }: { embedded?: boolean }) {
  const loc = useLocation(),
    s = managementRepo.signal.value,
    teams = teamsRepo.signal.value,
    employees = employeesRepo.signal.value,
    personal = personalRepo.signal.value;
  const query = new URLSearchParams(window.location.search),
    initial = query.get('area') ?? 'cockpit';
  const recordQuery = query.get('record') ?? '',
    createQuery = query.get('create') ?? '';
  const handledQuery = useRef('');
  const queryTeam = query.get('team') ?? '',
    queryEmployee = query.get('employee') ?? '';
  const [area, setArea] = useState(titles[initial] ? initial : 'cockpit'),
    [now, setNow] = useState(() => new Date()),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(''),
    [teamFilter, setTeamFilter] = useState(query.get('team') ?? ''),
    [empFilter, setEmpFilter] = useState(query.get('employee') ?? ''),
    [quarterFilter, setQuarterFilter] = useState(''),
    [statusFilter, setStatusFilter] = useState(''),
    [editor, setEditor] = useState<{ area: string; convert?: string } | null>(null),
    [row, setRow] = useState<ManagementRow>({ id: '' }),
    [formError, setFormError] = useState(''),
    [gateLevel, setGateLevel] = useState(false),
    [gateProcess, setGateProcess] = useState(false),
    [picker, setPicker] = useState(false);
  useEffect(() => {
    setArea(titles[initial] ? initial : 'cockpit');
  }, [initial]);
  const finishEditor = useCallback(() => {
    setEditor(null);
    if (embedded) loc.route(routes.management.path + '?area=' + area);
  }, [embedded, loc, area]);
  const closeEditor = useCallback(() => {
    if (!busy) finishEditor();
  }, [busy, finishEditor]);
  useEffect(() => {
    setTeamFilter(queryTeam);
    setEmpFilter(queryEmployee);
  }, [queryTeam, queryEmployee]);
  const closePicker = useCallback(() => setPicker(false), []);
  async function load() {
    setError('');
    try {
      const session = await getSession();
      await Promise.all([
        managementRepo.load(),
        teamsRepo.loadAll(),
        employeesRepo.loadAll(),
        ...(session ? [personalRepo.loadFor(session.user.id)] : []),
      ]);
      setLoaded(true);
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const go = (a: string) => {
    setArea(a);
    setSearch('');
    setTeamFilter('');
    setEmpFilter('');
    setQuarterFilter('');
    setStatusFilter('');
    loc.route(routes.management.path + '?area=' + a);
  };
  const teamName = (id: string | undefined) =>
    teams.find((t) => t.id === id)?.name ?? 'Без команды';
  const empName = (id: string | undefined) => employees.find((e) => e.id === id)?.fullName ?? '';
  const open = (a: string, x?: ManagementRow) => {
    setEditor({ area: a });
    setRow({ ...defaultRow(a, now), ...x });
    setFormError('');
    setGateLevel(false);
    setGateProcess(false);
  };
  useEffect(() => {
    if (!loaded) return;
    const key = `${initial}:${recordQuery}:${createQuery}`;
    if (handledQuery.current === key) return;
    handledQuery.current = key;
    if (recordQuery) {
      const sourceArea = initial === 'rhythm' ? 'daily' : initial;
      const source = managementAreas.includes(sourceArea as ManagementArea)
        ? s[sourceArea as ManagementArea].find((x) => x.id === recordQuery)
        : undefined;
      if (source) {
        setEditor({ area: sourceArea });
        setRow({ ...source });
        setFormError('');
      } else setError('Запись не найдена или уже удалена.');
    } else if (createQuery === '1' && initial === 'actions') {
      setEditor({ area: 'actions' });
      setRow(defaultRow('actions', now));
      setFormError('');
    }
  }, [loaded, initial, recordQuery, createQuery, s, now]);
  const afterSource = (a: ManagementArea, x: ManagementRow) =>
    open('actions', {
      ...defaultRow('actions', now),
      source: a + ':' + x.id,
      teamId: x.teamId ?? '',
      employeeId: x.employeeId ?? '',
    });
  const convert = (x: ManagementRow) => {
    open('actions', { ...defaultRow('actions', now), title: x.title! });
    setEditor({ area: 'actions', convert: x.id });
  };
  async function save(e: Event) {
    e.preventDefault();
    if (!editor) return;
    setBusy(true);
    setFormError('');
    try {
      const next = structuredClone(s);
      if (editor.area === 'sprint') {
        next.sprintStart = row.sprintStart ?? '';
      } else {
        const a = editor.area as ManagementArea;
        const x: ManagementRow = { ...row, id: row.id || crypto.randomUUID() };
        if (a === 'actions' && x.type !== 'ПОРУЧЕНИЕ') x.assignee = '';
        const parsed = managementSchemas[a].parse(x) as ManagementRow;
        const index = next[a].findIndex((r) => r.id === x.id);
        if (index < 0) next[a].push(parsed);
        else next[a][index] = parsed;
        if (editor.convert) {
          const d = next.daily.find((d) => d.id === editor.convert)!;
          d.status = 'CONVERTED';
          d.actionId = x.id;
          next.focus.refs = next.focus.refs.map((ref) =>
            ref.area === 'daily' && ref.id === d.id ? { area: 'actions', id: x.id } : ref,
          );
        }
        const addToFocus = (e as SubmitEvent).submitter?.getAttribute('data-add-focus') === 'true';
        if (a === 'actions' && addToFocus) {
          if (x.status === 'DONE') throw new Error('Завершённое действие нельзя добавить в фокус.');
          const today = iso(new Date());
          if (next.focus.date !== today) next.focus = { date: today, refs: [] };
          if (!next.focus.refs.some((ref) => ref.area === 'actions' && ref.id === x.id)) {
            if (next.focus.refs.length >= 3)
              throw new Error(
                'В фокусе уже три действия. Сохраните без добавления в фокус или сначала освободите место.',
              );
            next.focus.refs.push({ area: 'actions', id: x.id });
          }
        }
      }
      await managementRepo.save(next, gateLevel && gateProcess);
      finishEditor();
      toast.success(LOCAL_MODE ? 'Сохранено на ПК' : 'Сохранено');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function focus(a: 'actions' | 'daily', id: string) {
    setBusy(true);
    setError('');
    try {
      const next = structuredClone(s);
      if (next.focus.date !== iso(now)) next.focus = { date: iso(now), refs: [] };
      const index = next.focus.refs.findIndex((r) => r.area === a && r.id === id);
      if (index >= 0) next.focus.refs.splice(index, 1);
      else {
        if (next.focus.refs.length >= 3)
          throw new Error('Уже выбраны три действия. Сначала уберите одно.');
        next.focus.refs.push({ area: a, id });
      }
      await managementRepo.save(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!editor || !row.id) return;
    if (
      !(await confirm({
        title: 'Удалить запись?',
        body: 'Она исчезнет из рабочего списка и TODAY. Предыдущая версия останется в резервной копии.',
        danger: true,
      }))
    )
      return;
    setBusy(true);
    try {
      const next = structuredClone(s),
        a = editor.area as ManagementArea;
      next[a] = next[a].filter((x) => x.id !== row.id);
      next.focus.refs = next.focus.refs.filter((r) => !(r.area === a && r.id === row.id));
      await managementRepo.save(next);
      finishEditor();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const rows = (a: ManagementArea) =>
    s[a].filter(
      (x) =>
        (!teamFilter || x.teamId === teamFilter) &&
        (!empFilter || x.employeeId === empFilter) &&
        (!quarterFilter || x.quarter === quarterFilter) &&
        (!statusFilter || x.status === statusFilter) &&
        (!search ||
          [...Object.values(x), teamName(x.teamId), empName(x.employeeId)]
            .join(' ')
            .toLocaleLowerCase('ru')
            .includes(search.toLocaleLowerCase('ru'))),
    );
  const selected = (a: string, id: string) =>
    s.focus.date === iso(now) && s.focus.refs.some((r) => r.area === a && r.id === id);
  function RecordCard({ a, x }: { a: ManagementArea; x: ManagementRow }) {
    return (
      <div class="mos-record">
        <div class="min-w-0 flex-1">
          <button class="text-left font-medium hover:text-blue-300" onClick={() => open(a, x)}>
            {((x.title ?? empName(x.employeeId)) || x.person) ?? teamName(x.teamId)}
          </button>
          <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            {x.type && <span>{x.type}</span>}
            {x.quarter && <span>{x.quarter}</span>}
            {x.teamId && (
              <a href={teamUrl(x.teamId)} class="hover:underline">
                {teamName(x.teamId)}
              </a>
            )}
            {x.employeeId && (
              <a href={employeeUrl(x.employeeId)} class="hover:underline">
                {empName(x.employeeId)}
              </a>
            )}
            {x.due && (
              <span
                class={
                  x.due < iso(now) && !['DONE', 'CLOSED'].includes(x.status!) ? 'text-red-300' : ''
                }
              >
                {x.due}
              </span>
            )}
            {x.date && <span>{x.date}</span>}
            {x.status && <ManagementBadge value={x.status} />}{' '}
            {x.readiness && <ManagementBadge value={x.readiness} />}
          </div>
          {x.note && <p class="mt-3 text-sm text-slate-300 whitespace-pre-wrap">{x.note}</p>}
          {x.criterion && <p class="mt-3 text-sm text-slate-400">Критерий: {x.criterion}</p>}
          {x.owner && <p class="mt-2 text-sm text-slate-400">Owner: {x.owner}</p>}
          {x.assignee && <p class="mt-2 text-sm text-slate-400">Кому: {x.assignee}</p>}
          {x.risk && <p class="mt-2 text-sm text-amber-200">{x.risk}</p>}
          {x.category && <p class="mt-2 text-xs text-slate-400">{x.category}</p>}
          {x.signal && (
            <p class="mt-2 text-sm text-slate-400">
              {x.profile} · {x.signal}
            </p>
          )}
          {x.approval && (
            <p class="mt-2 text-sm text-slate-400">
              {x.approval} · {x.exception}
            </p>
          )}
          {x.outcome && <p class="mt-2 text-sm text-slate-300 whitespace-pre-wrap">{x.outcome}</p>}
          {x.source && (
            <button
              class="mt-2 text-xs text-blue-300 underline"
              onClick={() => {
                const [kind, id] = x.source!.split(':');
                const source = s[kind as ManagementArea]?.find((r) => r.id === id);
                if (source) open(kind!, source);
              }}
            >
              Открыть источник
            </button>
          )}
        </div>
        <div class="flex shrink-0 flex-col gap-2">
          {a === 'actions' && x.status !== 'DONE' && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void focus('actions', x.id)}
            >
              {selected(a, x.id) ? 'Убрать из фокуса' : 'В фокус'}
            </Button>
          )}
          {['problems', 'observations', 'planning', 'people', 'improvements'].includes(a) && (
            <Button variant="secondary" size="sm" onClick={() => afterSource(a, x)}>
              Действие
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => open(a, x)}>
            Открыть
          </Button>
        </div>
      </div>
    );
  }
  function Filters({ a }: { a: ManagementArea }) {
    return (
      <div class="flex flex-wrap gap-3">
        <TextInput
          aria-label="Поиск"
          placeholder="Поиск записей…"
          value={search}
          onInput={(e) => setSearch(e.currentTarget.value)}
          class="!w-64"
        />
        <select
          class="mos-input !w-auto"
          aria-label="Фильтр команды"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.currentTarget.value)}
        >
          <option value="">Все команды</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {empFilter && (
          <Button variant="secondary" onClick={() => setEmpFilter('')}>
            Сотрудник: {empName(empFilter)} ×
          </Button>
        )}
        {['planning', 'people', 'improvements'].includes(a) && (
          <select
            class="mos-input !w-auto"
            aria-label="Квартал"
            value={quarterFilter}
            onChange={(e) => setQuarterFilter(e.currentTarget.value)}
          >
            <option value="">Все кварталы</option>
            {[...new Set(s[a].map((x) => x.quarter))].map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        )}
        {['actions', 'problems'].includes(a) && (
          <select
            aria-label="Фильтр статуса"
            class="mos-input !w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.currentTarget.value)}
          >
            <option value="">Все статусы</option>
            {(a === 'actions'
              ? ['OPEN', 'WAITING', 'CONTROL', 'DONE']
              : ['NEW', 'IN WORK', 'MONITORING', 'CLOSED']
            ).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        )}
      </div>
    );
  }
  function Collection({ a }: { a: ManagementArea }) {
    return (
      <div class="space-y-4">
        <Filters a={a} />
        {rows(a).length ? (
          <div class="mos-panel !p-0">
            {rows(a).map((x) => (
              <RecordCard key={x.id} a={a} x={x} />
            ))}
          </div>
        ) : (
          <Box title={titles[a]!}>
            <Empty
              text={
                s[a].length
                  ? 'Нет записей по выбранным фильтрам.'
                  : 'Пока нет записей. Добавьте реальное действие или наблюдение, когда оно появится.'
              }
              action={s[a].length ? 'Сбросить фильтры' : 'Добавить запись'}
              onClick={() =>
                s[a].length
                  ? (setSearch(''),
                    setTeamFilter(''),
                    setEmpFilter(''),
                    setQuarterFilter(''),
                    setStatusFilter(''))
                  : open(a)
              }
            />
          </Box>
        )}
      </div>
    );
  }
  function Scorecard() {
    return (
      <>
        <div class="mos-panel overflow-x-auto">
          <table class="mos-table">
            <thead>
              <tr>
                <th>Команда</th>
                {signalDefinitions.map((d) => (
                  <th key={d.key}>
                    {d.label}
                    <span class="mt-1 block font-normal text-slate-500">{d.type}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <td>
                    <a href={teamUrl(t.id)} class="hover:text-blue-300">
                      {t.name}
                    </a>
                    {!scopeOf(s, t.id) && (
                      <button
                        class="mt-2 block text-xs text-amber-300"
                        onClick={() => open('scopes', { id: '', teamId: t.id })}
                      >
                        Настроить ответственность
                      </button>
                    )}
                  </td>
                  {signalDefinitions.map((d) => {
                    const x = s.signals.find((x) => x.teamId === t.id && x.signal === d.key);
                    return (
                      <td key={d.key}>
                        {applicable(scopeOf(s, t.id), d.key) ? (
                          <button
                            class="w-full rounded-lg p-2 text-left hover:bg-white/5"
                            aria-label={`${t.name}: ${d.label}`}
                            onClick={() =>
                              open('signals', x ?? { id: '', teamId: t.id, signal: d.key })
                            }
                          >
                            <ManagementBadge value={x?.level} />
                            <span class="mt-2 block text-xs text-slate-400">
                              {x?.basis ?? 'Внести оценку'}
                            </span>
                          </button>
                        ) : (
                          <span class="text-xs text-slate-500">
                            {scopeOf(s, t.id) ? 'Не применимо' : 'Не настроено'}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!teams.length && (
            <Empty
              text="Для Scorecard нужны команды из справочника CRM."
              action="Открыть команды"
              onClick={() => loc.route(routes.teams.path)}
            />
          )}
        </div>
        <details class="mos-panel mt-4">
          <summary class="cursor-pointer font-medium">Пороги и источники</summary>
          <div class="mt-4 space-y-3 text-sm text-slate-400">
            {signalDefinitions.map((d) => (
              <p key={d.key}>
                <b>{d.label}:</b> {d.rule}
              </p>
            ))}
            <p>
              Fact — портал, ввод вручную. Management signal — DPO. Расчётные риски и Pulse CRM не
              подменяют эти оценки.
            </p>
          </div>
        </details>
      </>
    );
  }
  function Cockpit() {
    const c = managementCockpit(s, now);
    return (
      <div class="space-y-5">
        <WorkGuide state={s} employees={employees} personal={personal} now={now} />
        {c.controls.length + c.monitoring.length + c.unresolved.length > 0 && (
          <Box title="Требуется явное решение">
            <p class="mb-3 text-sm text-amber-200">
              Проверка эффекта наступила или осталось разовое действие прошлого дня. Статусы сами не
              меняются.
            </p>
            <div class="flex flex-wrap gap-2">
              {c.controls.map((x) => (
                <Button key={x.id} variant="secondary" onClick={() => open('actions', x)}>
                  CONTROL · {x.title}
                </Button>
              ))}
              {c.monitoring.map((x) => (
                <Button key={x.id} variant="secondary" onClick={() => open('problems', x)}>
                  MONITORING · {x.title}
                </Button>
              ))}
              {c.unresolved.map((x) => (
                <Button key={x.id} variant="secondary" onClick={() => go('rhythm')}>
                  Не завершено: {x.title}
                </Button>
              ))}
            </div>
          </Box>
        )}
        <div class="grid gap-5 lg:grid-cols-3">
          <div class="space-y-5 lg:col-span-2">
            <Box
              title={`TODAY · ${c.focus.length} / 3`}
              action={
                <Button size="sm" onClick={() => setPicker(true)}>
                  Выбрать действия
                </Button>
              }
            >
              {c.focus.length ? (
                c.focus.map(({ area: a, row: x }, i) => (
                  <div key={x.id} class="flex items-start gap-4 border-t border-white/5 py-4">
                    <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-200 tabular-nums">
                      {i + 1}
                    </span>
                    <div class="flex-1">
                      <button
                        class="text-left font-medium hover:text-blue-300"
                        onClick={() => open(a, x)}
                      >
                        {x.title}
                      </button>
                      <p class="mt-1 text-xs text-slate-400">
                        {a === 'daily' ? 'Rhythm · тема дня' : `${x.type} · ${x.due}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Убрать из TODAY"
                      disabled={busy}
                      onClick={() => void focus(a, x.id)}
                    >
                      ×
                    </Button>
                  </div>
                ))
              ) : (
                <Empty
                  text="Выберите до трёх действий. Завтрашний фокус не наследует сегодняшний выбор."
                  action="Выбрать"
                  onClick={() => setPicker(true)}
                />
              )}
            </Box>
            <Box
              title="ATTENTION · Отклонения"
              action={
                <Button variant="ghost" size="sm" onClick={() => go('signals')}>
                  Scorecard →
                </Button>
              }
            >
              {c.attention.length ? (
                c.attention.map((x) => (
                  <div
                    key={x.id}
                    class="flex items-start justify-between gap-4 border-t border-white/5 py-4"
                  >
                    <div>
                      <button
                        class="text-left font-medium hover:text-blue-300"
                        onClick={() => open('signals', x)}
                      >
                        {teamName(x.teamId)} ·{' '}
                        {signalDefinitions.find((d) => d.key === x.signal)?.label}
                      </button>
                      <p class="mt-2 text-sm text-slate-400">{x.basis}</p>
                      <p class="mt-2 text-xs text-slate-500">
                        {signalDefinitions.find((d) => d.key === x.signal)?.type}
                      </p>
                    </div>
                    <ManagementBadge value={x.level} />
                  </div>
                ))
              ) : (
                <Empty
                  text={`Отклонения не зафиксированы. Оценено сигналов: ${s.signals.length}. Отсутствие оценки не означает Green.`}
                  action="Проверить Scorecard"
                  onClick={() => go('signals')}
                />
              )}
            </Box>
            {[
              ['Реестр · Просроченное, сегодня и завтра', 'actions', c.actions],
              ['BOSS · Текущая календарная неделя', 'actions', c.boss],
              ['Backlog · Наступившие даты', 'problems', c.problems],
            ].map(([title, a, list]) => (
              <Box key={title as string} title={title as string}>
                {(list as ManagementRow[]).length ? (
                  (list as ManagementRow[]).map((x) => (
                    <RecordCard a={a as ManagementArea} x={x} key={x.id} />
                  ))
                ) : (
                  <p class="py-3 text-sm text-slate-400">Нет записей по условиям этого блока.</p>
                )}
              </Box>
            ))}
          </div>
          <aside class="space-y-5">
            <Box title="Ритм дня">
              <Timeline />
            </Box>
            <Box title="Приоритет выбора">
              <ol class="list-decimal space-y-3 pl-5 text-sm text-slate-400">
                <li>Срочное перед руководством</li>
                <li>Критичные отклонения, требующие вмешательства</li>
                <li>Просроченные личные действия</li>
                <li>Дедлайны сегодня / завтра</li>
                <li>Ближайшие BOSS</li>
                <li>Тема дня</li>
              </ol>
            </Box>
            <Box title="Пятничное закрытие">
              <p class="mb-4 text-sm text-slate-400">50 минут — Backlog, 45 минут — Реестр.</p>
              <Button variant="secondary" onClick={() => go('review')}>
                Weekly Review →
              </Button>
            </Box>
          </aside>
        </div>
      </div>
    );
  }
  function Timeline() {
    return (
      <div class="space-y-5">
        {[
          ['09:00', 'Почтовый triage · 15 минут'],
          ['09:15', 'Cockpit · выбор трёх действий'],
          ['09:25', 'Системная работа · 95 минут'],
          ['16:30', 'Эскалации и согласования'],
        ].map(([time, text]) => (
          <div key={time} class="flex gap-4 text-sm">
            <time class="text-slate-500 tabular-nums">{time}</time>
            <p class="text-slate-300">{text}</p>
          </div>
        ))}
      </div>
    );
  }
  function Rhythm() {
    return (
      <div class="space-y-5">
        <CrmRhythm />
        <div class="grid gap-5 lg:grid-cols-2">
          <Box title="Рабочий день">
            <Timeline />
          </Box>
          <Box
            title="Трёхнедельный спринт"
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => open('sprint', { id: '', sprintStart: s.sprintStart })}
              >
                Настроить
              </Button>
            }
          >
            <p class="text-sm text-slate-400">Начало: {s.sprintStart || 'не задано'}</p>
            {[
              'Commit & Diagnose · синки',
              'Execute & Exceptions · отклонения',
              'Outcome & Prepare · итоги и готовность',
            ].map((x, i) => (
              <p
                class={`mt-3 rounded-lg p-3 text-sm ${sprintWeek(s.sprintStart, now) === i + 1 ? 'bg-blue-500/15 text-blue-200' : 'bg-white/5 text-slate-400'}`}
                key={x}
              >
                Неделя {i + 1} · {x}
              </p>
            ))}
          </Box>
        </div>
        <Box
          title="Границы ответственности"
          action={
            <Button size="sm" onClick={() => open('scopes')}>
              Настроить команду
            </Button>
          }
        >
          <p class="mb-4 text-sm text-slate-400">
            По спецификации: ЕФС, City+, Знание о клиенте — Delivery + People; Платёжные инструменты
            — только Delivery; Пассивы ЕФС — только People. Используются существующие команды CRM.
          </p>
          {s.scopes.map((x) => (
            <div class="flex items-center justify-between border-t border-white/5 py-3" key={x.id}>
              <span>
                {teamName(x.teamId)} · {scopeLabel[x.scope!]}
              </span>
              <Button size="sm" variant="ghost" onClick={() => open('scopes', x)}>
                Изменить
              </Button>
            </div>
          ))}
          {!teams.length && (
            <Button variant="secondary" onClick={() => loc.route(routes.teams.path)}>
              Добавить команду в CRM
            </Button>
          )}
        </Box>
        <Box
          title="Квартальные якоря"
          action={
            <Button size="sm" onClick={() => open('quarters')}>
              Задать даты
            </Button>
          }
        >
          <p class="mb-4 text-sm text-slate-400">
            Planning: подходящий вторник, цель — минимум 21 день до внешнего утверждения. People:
            среда около конца квартала. Improvement: пятница около конца квартала. Поздняя внешняя
            дата не блокирует проверку.
          </p>
          {s.quarters.map((x) => (
            <div key={x.id} class="mos-record">
              <div>
                <p class="font-medium">{x.quarter}</p>
                <p class="mt-2 text-sm text-slate-400">
                  Утверждение: {displayText(x.approvalDate, '—')} · Planning:{' '}
                  {displayText(x.planningDate, '—')} · People: {displayText(x.peopleDate, '—')} ·
                  Improvement: {displayText(x.improvementDate, '—')}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => open('quarters', x)}>
                Изменить
              </Button>
            </div>
          ))}
        </Box>
        <Box
          title="Разовые действия по теме дня"
          action={
            <Button size="sm" onClick={() => open('daily')}>
              Добавить
            </Button>
          }
        >
          <p class="mb-4 text-sm text-slate-400">
            Незавершённое к концу дня — в Реестр со сроком либо сознательно отбросить.
            Автоматического переноса в TODAY нет.
          </p>
          {s.daily.map((x) => (
            <div key={x.id} class="mos-record">
              <div>
                <p>{x.title}</p>
                <p class="mt-2 text-xs text-slate-400">
                  {x.date} ·{' '}
                  {x.status === 'CONVERTED'
                    ? 'Перенесено в Реестр'
                    : x.status === 'DISCARDED'
                      ? 'Отброшено'
                      : x.status === 'DONE'
                        ? 'Завершено'
                        : 'Не завершено'}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                {x.status === 'OPEN' && (
                  <>
                    <Button size="sm" onClick={() => convert(x)}>
                      В Реестр
                    </Button>
                    {x.date === iso(now) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void focus('daily', x.id)}
                      >
                        В фокус
                      </Button>
                    )}
                  </>
                )}
                {x.status !== 'CONVERTED' ? (
                  <Button size="sm" variant="ghost" onClick={() => open('daily', x)}>
                    Результат
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      open(
                        'actions',
                        s.actions.find((r) => r.id === x.actionId),
                      )
                    }
                  >
                    Открыть действие
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Box>
        <Box title="Неделя 1 · Командные синки">
          <div class="overflow-x-auto">
            <table class="mos-table">
              <thead>
                <tr>
                  <th>День</th>
                  <th>Тема самостоятельной работы</th>
                  <th>Синк · 60 минут</th>
                </tr>
              </thead>
              <tbody>
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт'].map((d, i) => (
                  <tr key={d}>
                    <td>{d}</td>
                    <td>{themes[i + 1]}</td>
                    <td>
                      {
                        [
                          'Знание о клиенте',
                          'City+',
                          'Платёжные инструменты · только delivery',
                          'Пассивы ЕФС · только people',
                          'ЕФС · после разделения два синка',
                        ][i]
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
        <Box title="Нагрузка и исключения">
          <p class="text-sm leading-6 text-slate-400">
            Утренний блок: 75 минут почты + 50 минут Cockpit + 475 минут системной работы = 10 часов
            в неделю. Ведение Реестра рассеяно по дню. Цель административного overhead — около 2
            часов в неделю. Квартальные проверки выполняются внутри тематических блоков.
          </p>
          <p class="mt-3 text-sm leading-6 text-slate-400">
            План дня могут прервать: production incident, срочный запрос руководства,
            delivery-блокер, обязательное согласование сегодня, срочный отчёт. Внешние встречи: ср —
            ИТ-блок и ротационный 1:1; чт — начальник и департамент; пт — ротационный 1:1.
          </p>
        </Box>
      </div>
    );
  }
  function Review() {
    const w = weeklyManagement(s, now);
    return (
      <div class="space-y-5">
        {[
          ['Просроченное', 'actions', w.overdue],
          ['WAITING · Что зависло?', 'actions', w.waiting],
          ['BOSS · Полная сверка', 'actions', w.boss],
          ['CONTROL · Следующая неделя', 'actions', w.controls],
          ['Backlog · Просрочка и даты проверки', 'problems', w.problems],
        ].map(([title, a, list]) => (
          <Box key={title as string} title={title as string}>
            {(list as ManagementRow[]).length ? (
              (list as ManagementRow[]).map((x) => (
                <RecordCard a={a as ManagementArea} x={x} key={x.id} />
              ))
            ) : (
              <p class="text-sm text-slate-400">Нет записей для проверки.</p>
            )}
          </Box>
        ))}
        <Box title="Проверить управленческим суждением">
          <p class="mb-4 text-sm text-slate-400">
            Какие проблемы без движения? Где IN WORK требует пересмотра owner / срока? Дата
            редактирования не доказывает прогресс; портал не делает этот вывод автоматически.
          </p>
          <Button variant="secondary" onClick={() => go('problems')}>
            Открыть Backlog
          </Button>
        </Box>
      </div>
    );
  }
  const content = () =>
    area === 'cockpit' ? (
      <Cockpit />
    ) : area === 'signals' ? (
      <Scorecard />
    ) : area === 'rhythm' ? (
      <Rhythm />
    ) : area === 'review' ? (
      <Review />
    ) : area === 'data' ? (
      LOCAL_MODE ? (
        <LocalBackup />
      ) : (
        <Box title="Хранение данных">
          <p class="text-sm text-slate-400">
            Данные Management OS сохраняются в вашем защищённом разделе Supabase и доступны только
            после входа в Staff CRM.
          </p>
        </Box>
      )
    ) : area === 'reference' ? (
      <div class="space-y-4">
        <p class="text-sm text-slate-400">
          Портал автоматизирует отображение, даты и сохранение. Ввод данных и управленческие решения
          остаются ручными. Ни Pulse, ни расчётный риск CRM не создают записи Management OS
          автоматически.
        </p>
        <details class="mos-panel">
          <summary class="cursor-pointer font-medium">Дополнение: общий ритм Staff CRM</summary>
          <div class="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-400">
            {crmRhythmSpec}
          </div>
        </details>
        {spec.split(/(?=^## \d+\.)/m).map((part, i) => {
          const [title, ...body] = part.split('\n');
          return (
            <details class="mos-panel" key={i}>
              <summary class="cursor-pointer font-medium">{title?.replace(/^#+ /, '')}</summary>
              <div class="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-400">
                {body.join('\n')}
              </div>
            </details>
          );
        })}
      </div>
    ) : managementAreas.includes(area as ManagementArea) ? (
      <Collection a={area as ManagementArea} />
    ) : (
      <Cockpit />
    );
  const editable = [
    'actions',
    'problems',
    'observations',
    'planning',
    'people',
    'improvements',
  ].includes(area);
  return (
    <div class="mos-root">
      <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-xs text-slate-500">STAFF CRM / MANAGEMENT OS v0</p>
          <h2 class="mt-2 text-2xl font-semibold">{titles[area]}</h2>
          {activities[area] && (
            <div class="mt-2 max-w-3xl">
              <p class="text-sm leading-6 text-slate-300">{activities[area]?.purpose}</p>
              <p class="mt-2 text-xs leading-5 text-slate-500">{activities[area]?.cadence}</p>
            </div>
          )}
        </div>
        <div class="flex gap-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void load()}>
            Обновить
          </Button>
          {editable && (
            <Button onClick={() => open(area)}>
              ＋ {area === 'actions' ? 'Действие' : area === 'problems' ? 'Проблема' : 'Запись'}
            </Button>
          )}
        </div>
      </header>
      <div
        class={embedded ? 'space-y-4' : 'grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]'}
      >
        {!embedded && (
          <>
            <label class="block lg:hidden">
              <span class="mb-2 block text-xs text-slate-400">
                Раздел · по частоте использования
              </span>
              <select
                class="mos-input w-full"
                value={area}
                onChange={(event) => go(event.currentTarget.value)}
              >
                {activityGroups.map((group) => (
                  <optgroup key={group.title} label={group.title}>
                    {group.areas.map((a) => (
                      <option key={a} value={a}>
                        {titles[a]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <nav class="hidden gap-5 lg:grid" aria-label="Management OS">
              {activityGroups.map((group, index) => {
                const content = (
                  <section key={group.title} aria-label={group.title}>
                    <h3 class="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                      {group.title}
                    </h3>
                    <div class="flex flex-col gap-1">
                      {group.areas.map((a) => (
                        <button
                          key={a}
                          class={`rounded-lg px-3 py-2.5 text-left text-sm ${a === area ? 'bg-blue-500/15 font-medium text-blue-200' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
                          aria-current={area === a ? 'page' : undefined}
                          onClick={() => go(a)}
                        >
                          <span class="block">{titles[a]}</span>
                          <span class="mt-1 block text-xs font-normal leading-4 text-slate-500">
                            {activities[a]?.summary}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                );
                return index < 2 ? (
                  content
                ) : (
                  <details
                    key={group.title}
                    open={group.areas.includes(area)}
                    class="border-t border-white/10 pt-3"
                  >
                    <summary class="cursor-pointer px-3 text-sm text-slate-400">
                      {group.title}
                    </summary>
                    <div class="mt-3">{content}</div>
                  </details>
                );
              })}
            </nav>
          </>
        )}
        <div class="min-w-0">
          {error && (
            <p
              class="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200"
              role="alert"
            >
              {error}
            </p>
          )}
          {hints[area] && !embedded && (
            <p class="mb-5 rounded-xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-400">
              {hints[area]}
            </p>
          )}
          {!loaded ? (
            <Empty
              text={error ? 'Загрузка не завершена.' : 'Загрузка данных…'}
              action={error ? 'Повторить' : undefined}
              onClick={() => void load()}
            />
          ) : embedded && editor ? null : (
            content()
          )}
        </div>
      </div>
      <EditorSurface
        inline={embedded}
        open={!!editor}
        onClose={closeEditor}
        title={editor ? (titles[editor.area] ?? editor.area) : ''}
        maxWidth="lg"
      >
        {editor && (
          <form
            class={embedded ? 'space-y-4' : 'max-h-[75dvh] space-y-4 overflow-y-auto pr-2'}
            onSubmit={(e) => void save(e)}
          >
            {editor.area === 'signals' && (
              <>
                <p class="text-sm text-slate-300">
                  {teamName(row.teamId)} ·{' '}
                  {signalDefinitions.find((d) => d.key === row.signal)?.label}
                </p>
                <p class="text-sm leading-6 text-slate-400">
                  {signalDefinitions.find((d) => d.key === row.signal)?.rule}
                </p>
              </>
            )}
            {editor.area === 'problems' && !row.id && (
              <div class="rounded-xl border border-blue-400/20 bg-blue-500/10 p-4">
                <p class="mb-3 text-sm font-medium">Тест системности · оба условия обязательны</p>
                <label class="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    required
                    checked={gateLevel}
                    onChange={(e) => setGateLevel(e.currentTarget.checked)}
                  />
                  Выходит за нормальное решение DPO / лида
                </label>
                <label class="mt-3 flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    required
                    checked={gateProcess}
                    onChange={(e) => setGateProcess(e.currentTarget.checked)}
                  />
                  Требует изменения процесса, правил или механизма управления
                </label>
                <p class="mt-3 text-xs text-slate-400">
                  Повторяемость, масштаб и влияние на обязательства — усилители. Баллы не считаются.
                </p>
              </div>
            )}
            {editor.area === 'observations' && (
              <p class="text-sm text-slate-400">
                Не фиксируйте «Без решения», если вопрос объективно требует вашего уровня. Поздняя
                эскалация — возможность спокойно повлиять уже существенно снизилась. Для People-only
                — только управление людьми DPO.
              </p>
            )}
            {fields(editor.area, row).map((d) => (
              <Field key={d.key} label={d.label} required={!d.optional}>
                {(p) =>
                  d.type === 'textarea' ? (
                    <TextArea
                      {...p}
                      required={!d.optional}
                      maxLength={10000}
                      value={row[d.key] ?? ''}
                      onInput={(e) => setRow({ ...row, [d.key]: e.currentTarget.value })}
                    />
                  ) : ['select', 'team', 'employee'].includes(d.type ?? '') ? (
                    <select
                      {...p}
                      class="mos-input"
                      required={!d.optional}
                      value={row[d.key] ?? ''}
                      onChange={(e) => {
                        const v = e.currentTarget.value;
                        setRow({
                          ...row,
                          [d.key]: v,
                          ...(d.key === 'profile' ? { signal: '' } : {}),
                        });
                      }}
                    >
                      <option value="">{d.optional ? 'Не указано' : 'Выберите…'}</option>
                      {d.type === 'team'
                        ? teams
                            .filter((t) => {
                              const sc = scopeOf(s, t.id);
                              return ['planning', 'improvements'].includes(editor.area)
                                ? sc === 'full' || sc === 'delivery'
                                : editor.area === 'people'
                                  ? sc === 'full' || sc === 'people'
                                  : true;
                            })
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))
                        : d.type === 'employee'
                          ? employees.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.fullName}
                              </option>
                            ))
                          : d.options?.map((v) => (
                              <option key={v} value={v}>
                                {statusLabels[v] ?? scopeLabel[v] ?? v}
                              </option>
                            ))}
                    </select>
                  ) : (
                    <TextInput
                      {...p}
                      required={!d.optional}
                      maxLength={10000}
                      type={d.type}
                      value={row[d.key] ?? ''}
                      onInput={(e) => setRow({ ...row, [d.key]: e.currentTarget.value })}
                    />
                  )
                }
              </Field>
            ))}
            {editor.area === 'actions' && row.meetingId && (
              <div class="rounded-lg border border-white/10 p-3">
                <p class="text-sm font-medium">Решение встречи</p>
                <p class="mt-2 whitespace-pre-wrap text-sm text-slate-400">
                  {s.meetingNotes?.find((m) => m.id === row.meetingId)?.decision ??
                    'Итог встречи недоступен'}
                </p>
                <button
                  type="button"
                  class="mt-2 text-sm text-blue-200"
                  onClick={() => loc.route(routes.dashboard.path + '?workflow=meeting')}
                >
                  История встреч →
                </button>
              </div>
            )}
            {editor.area === 'actions' && row.source && (
              <div class="flex items-center justify-between text-xs text-slate-400">
                <span>Действие связано с исходной записью</span>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => setRow({ ...row, source: '' })}
                >
                  Убрать связь
                </Button>
              </div>
            )}
            {editor.area === 'quarters' &&
              row.approvalDate &&
              row.planningDate &&
              dayNumber(row.approvalDate) - dayNumber(row.planningDate) < 21 && (
                <p class="text-sm text-amber-200">
                  До утверждения меньше 21 дня. Это отклонение от цели, но сохранение не
                  блокируется.
                </p>
              )}
            {editor.area === 'improvements' &&
              !row.id &&
              s.improvements.filter((x) => x.teamId === row.teamId && x.quarter === row.quarter)
                .length >= 3 && (
                <p class="text-sm text-amber-200">
                  У команды уже три темы за квартал. Проверьте необходимость ещё одной.
                </p>
              )}
            {formError && (
              <p
                role="alert"
                class="whitespace-pre-wrap rounded-lg bg-red-500/10 p-3 text-sm text-red-200"
              >
                {formError}
              </p>
            )}
            <div class="flex justify-between gap-3 border-t border-white/10 pt-4">
              {row.id ? (
                <Button variant="ghost" type="button" disabled={busy} onClick={() => void remove()}>
                  Удалить
                </Button>
              ) : (
                <span />
              )}
              <div class="flex gap-2">
                <Button variant="secondary" type="button" disabled={busy} onClick={closeEditor}>
                  Отмена
                </Button>
                {editor.area === 'actions' && !row.id && (
                  <Button type="submit" data-add-focus="true" disabled={busy} variant="secondary">
                    Сохранить и добавить в фокус
                  </Button>
                )}
                <Button type="submit" disabled={busy}>
                  {busy ? 'Сохраняется…' : 'Сохранить'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </EditorSurface>
      <Modal
        open={picker}
        onClose={closePicker}
        title="TODAY · Выбрать до трёх действий"
        maxWidth="lg"
      >
        <div class="max-h-[70dvh] overflow-y-auto">
          <p class="mb-4 text-sm text-slate-400">
            Руководство → критичные отклонения → просроченное → сроки → ближайшие BOSS → тема дня.
            Состав выбираете вы.
          </p>
          {error && (
            <p role="alert" class="mb-4 text-sm text-red-200">
              {error}
            </p>
          )}
          {[
            ...s.actions
              .filter((x) => x.status !== 'DONE')
              .map((x) => ({ a: 'actions' as const, x })),
            ...s.daily
              .filter((x) => x.date === iso(now) && x.status === 'OPEN')
              .map((x) => ({ a: 'daily' as const, x })),
          ].map(({ a, x }) => (
            <button
              key={x.id}
              disabled={busy || (!selected(a, x.id) && managementCockpit(s, now).focus.length >= 3)}
              class={`mb-2 flex w-full gap-3 rounded-lg border p-3 text-left text-sm disabled:opacity-40 ${selected(a, x.id) ? 'border-blue-400 bg-blue-500/10' : 'border-white/10'}`}
              onClick={() => void focus(a, x.id)}
            >
              <span>{selected(a, x.id) ? '✓' : '○'}</span>
              <span>
                {x.title}
                <span class="mt-1 block text-xs text-slate-500">
                  {a === 'daily' ? 'Тема дня' : `${x.type} · ${x.due}`}
                </span>
              </span>
            </button>
          ))}
          <div class="mt-5 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setPicker(false);
                open('actions');
              }}
            >
              ＋ В Реестр
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPicker(false);
                open('daily');
              }}
            >
              ＋ По теме дня
            </Button>
            <Button onClick={() => setPicker(false)}>Готово</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
