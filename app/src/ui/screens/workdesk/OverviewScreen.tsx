import { useLocation } from 'preact-iso';
import { routes } from '@/app/routes';
import { employeesRepo, teamsRepo, projectsRepo } from '@/infra/repos';
export function OverviewScreen() {
  const loc = useLocation();
  const groups = [
    {
      title: 'Люди и команды',
      links: [
        {
          label: `Сотрудники · ${employeesRepo.signal.value.length}`,
          text: 'Карточки, встречи, заметки и развитие',
          href: routes.crm.path,
        },
        {
          label: `Команды · ${teamsRepo.signal.value.length}`,
          text: 'Пульс, обратная связь и управленческие сигналы',
          href: routes.teams.path,
        },
        { label: 'Развитие', text: 'ИПР и готовность к росту', href: routes.development.path },
      ],
    },
    {
      title: 'Обязательства и проекты',
      links: [
        {
          label: 'Управленческий реестр',
          text: 'Действия личного контроля',
          href: routes.management.path + '?area=actions',
        },
        {
          label: 'Задачи сотрудников',
          text: 'Обязательства и сроки из CRM',
          href: routes.tasks.path,
        },
        {
          label: `Проекты · ${projectsRepo.signal.value.length}`,
          text: 'Контекст работы и зависимости',
          href: routes.projects.path,
        },
        { label: 'Личное', text: 'Заметки и личные задачи', href: routes.personal.path },
      ],
    },
    {
      title: 'Диагностика и история',
      links: [
        {
          label: 'Состояние команд',
          text: 'Scorecard — оценки и основания',
          href: routes.management.path + '?area=signals',
        },
        { label: 'Пульс', text: 'Факты и динамика команд', href: routes.pulse.path },
        {
          label: 'Системные проблемы',
          text: 'Management Backlog и проверка эффекта',
          href: routes.management.path + '?area=problems',
        },
        {
          label: 'Наблюдения о DPO и лидах',
          text: 'Факты об ответственности',
          href: routes.management.path + '?area=observations',
        },
        {
          label: 'Аналитика',
          text: 'Сводные показатели прежнего дашборда',
          href: routes.analytics.path,
        },
      ],
    },
  ];
  return (
    <div class="space-y-6">
      <div>
        <h2 class="text-xl font-semibold">Обзор</h2>
        <p class="mt-2 text-sm text-slate-400">
          Выберите объект или срез. Работа откроется здесь, рядом с фокусом и очередью.
        </p>
      </div>
      {groups.map((group) => (
        <section key={group.title}>
          <h3 class="mb-3 text-sm font-medium text-slate-400">{group.title}</h3>
          <div class="grid gap-3 md:grid-cols-2">
            {group.links.map((link) => (
              <button
                key={link.href}
                onClick={() => loc.route(link.href)}
                class="rounded-xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10"
              >
                <span class="block text-sm font-medium">{link.label}</span>
                <span class="mt-1 block text-xs leading-5 text-slate-400">{link.text}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <details class="border-t border-white/10 pt-4">
        <summary class="cursor-pointer text-sm text-slate-400">
          Квартальные контуры и правила
        </summary>
        <div class="mt-3 flex flex-wrap gap-3">
          {[
            ['planning', 'Planning'],
            ['people', 'People'],
            ['improvements', 'Improvement'],
            ['rhythm', 'Ритм'],
            ['reference', 'Спецификация'],
            ['data', 'Резервные копии'],
          ].map(([area, label]) => (
            <button
              key={area}
              class="rounded-lg border border-white/10 px-3 py-2 text-sm"
              onClick={() => loc.route(routes.management.path + '?area=' + area)}
            >
              {label}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
