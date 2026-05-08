/**
 * Построение списка уведомлений по сотрудникам.
 * Перенесено из legacy `index.html#buildNotifications`.
 *
 * Контракт уведомления (id) стабилен — UI хранит «прочитано/нет» по этим id
 * в localStorage `staff_crm_notif_read_v1`.
 */
import type { Employee } from '@/data/schema';
import { dayDiff, monthsSince, parseIsoDate, toIsoDate } from './dates';

export type NotifColor = 'red' | 'yellow' | 'blue';

/**
 * Вкладка, на которую перейдёт UI при клике.
 * Соответствует id вкладок в legacy-карточке сотрудника.
 */
export type NotifTab = 'main' | 'load' | 'tasks' | 'projects' | 'skills' | 'extra' | 'onetoone';

export interface Notification {
  id: string;
  color: NotifColor;
  text: string;
  employee: string;
  empId: string;
  tab: NotifTab;
}

/** Грамматика «N лет/года/год» в legacy-стиле (без полной поддержки 21+, как в исходнике). */
function yearsWord(n: number): string {
  if (n === 1) return 'год';
  if (n < 5) return 'года';
  return 'лет';
}

export function buildNotifications(employees: Employee[], now: Date): Notification[] {
  const notifs: Notification[] = [];
  const todayStr = toIsoDate(now);
  const todayDay = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  for (const e of employees) {
    const name = e.fullName;
    const months = monthsSince(e.salaryReviewDate ?? '', now);

    // RED: ФОТ просрочен > 12 мес
    if (months > 12) {
      notifs.push({
        id: `fot-overdue-${e.id}`,
        color: 'red',
        text: `Пересмотр ФОТ просрочен — ${months} мес без изменений`,
        employee: name,
        empId: e.id,
        tab: 'projects',
      });
    }

    // RED: просроченные задачи
    (e.tasks ?? []).forEach((t, i) => {
      if (t.status !== 'выполнена' && t.due && t.due < todayStr) {
        notifs.push({
          id: `task-overdue-${e.id}-${i}`,
          color: 'red',
          text: `Просроченная задача: «${t.text}» (${t.due})`,
          employee: name,
          empId: e.id,
          tab: 'tasks',
        });
      }
    });

    // RED: просроченные ИПР
    (e.development ?? []).forEach((d, i) => {
      if (d.status !== 'выполнено' && d.deadline && d.deadline < todayStr) {
        notifs.push({
          id: `ipr-overdue-${e.id}-${i}`,
          color: 'red',
          text: `Просроченная зона развития: «${d.zone}» (срок ${d.deadline})`,
          employee: name,
          empId: e.id,
          tab: 'skills',
        });
      }
    });

    // RED: высокий риск без комментария
    if (e.risk?.level === 'высокий' && !e.risk.comment) {
      notifs.push({
        id: `risk-no-comment-${e.id}`,
        color: 'red',
        text: 'Высокий риск увольнения без комментария',
        employee: name,
        empId: e.id,
        tab: 'extra',
      });
    }

    // YELLOW: ФОТ через 1-3 месяца
    if (months >= 9 && months <= 12) {
      notifs.push({
        id: `fot-soon-${e.id}`,
        color: 'yellow',
        text: `Пересмотр ФОТ скоро — прошло ${months} мес`,
        employee: name,
        empId: e.id,
        tab: 'projects',
      });
    }

    // YELLOW: задача истекает в ближайшие 7 дней
    (e.tasks ?? []).forEach((t, i) => {
      if (t.status !== 'выполнена' && t.due && t.due >= todayStr) {
        const d = parseIsoDate(t.due);
        if (d && d <= in7days) {
          notifs.push({
            id: `task-soon-${e.id}-${i}`,
            color: 'yellow',
            text: `Задача истекает через 7 дней: «${t.text}» (${t.due})`,
            employee: name,
            empId: e.id,
            tab: 'tasks',
          });
        }
      }
    });

    // YELLOW: отпуск через 7 дней
    (e.load?.vacations ?? []).forEach((v, i) => {
      if (v.from && v.from >= todayStr) {
        const d = parseIsoDate(v.from);
        if (d && d <= in7days) {
          notifs.push({
            id: `vac-soon-${e.id}-${i}`,
            color: 'yellow',
            text: `Уходит в отпуск через 7 дней (${v.from})`,
            employee: name,
            empId: e.id,
            tab: 'load',
          });
        }
      }
    });

    // YELLOW: 1-on-1 не проводился > 30 дней (или никогда)
    const lastMeeting = e.oneOnOne?.history?.[0]?.date ?? '';
    if (lastMeeting) {
      const d = parseIsoDate(lastMeeting);
      if (d) {
        const daysSince = dayDiff(d, now);
        if (daysSince > 30) {
          notifs.push({
            id: `o2o-overdue-${e.id}`,
            color: 'yellow',
            text: `1-on-1 не проводился ${daysSince} дней (последний ${lastMeeting})`,
            employee: name,
            empId: e.id,
            tab: 'onetoone',
          });
        }
      }
    } else {
      notifs.push({
        id: `o2o-never-${e.id}`,
        color: 'yellow',
        text: '1-on-1 ещё не проводился',
        employee: name,
        empId: e.id,
        tab: 'onetoone',
      });
    }

    // BLUE: день рождения сегодня
    if (e.birthday) {
      const bd = parseIsoDate(e.birthday);
      if (bd?.getDate() === todayDay && bd.getMonth() === todayMonth) {
        notifs.push({
          id: `bday-${e.id}-${todayYear}`,
          color: 'blue',
          text: '🎂 Сегодня день рождения!',
          employee: name,
          empId: e.id,
          tab: 'main',
        });
      }
    }

    // BLUE: годовщина работы
    if (e.hireDate) {
      const hd = parseIsoDate(e.hireDate);
      if (
        hd?.getDate() === todayDay &&
        hd.getMonth() === todayMonth &&
        hd.getFullYear() !== todayYear
      ) {
        const years = todayYear - hd.getFullYear();
        notifs.push({
          id: `anniv-${e.id}-${todayYear}`,
          color: 'blue',
          text: `🎉 Годовщина — ${years} ${yearsWord(years)} в компании!`,
          employee: name,
          empId: e.id,
          tab: 'main',
        });
      }
    }

    // BLUE: запланированный 1-on-1 сегодня
    if (e.oneOnOne?.nextDate === todayStr) {
      notifs.push({
        id: `o2o-today-${e.id}`,
        color: 'blue',
        text: '1-on-1 запланирован сегодня',
        employee: name,
        empId: e.id,
        tab: 'onetoone',
      });
    }
  }

  return notifs;
}
