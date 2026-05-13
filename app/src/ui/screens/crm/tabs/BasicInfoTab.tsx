import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Employee } from '@/data/schema';
import { employeesRepo } from '@/infra/repos';
import { toast } from '@/state/ui';
import { Button } from '@/ui/components/Button';
import { Field, Select, TextArea, TextInput } from '@/ui/components/Field';

const GRADES = ['Junior', 'Middle', 'Senior', 'Lead'] as const;
const PROMOTIONS = [
  'не готов',
  'готов через 6 мес',
  'готов через год',
  'готов сейчас',
] as const;
const RISKS = ['низкий', 'средний', 'высокий'] as const;
const WORK_PREFS = ['офис', 'гибрид', 'удалённо'] as const;

interface Form {
  fullName: string;
  role: string;
  team: string;
  grade: string;
  hireDate: string;
  salaryReviewDate: string;
  salary: number;
  email: string;
  telegram: string;
  location: string;
  employeeNumber: string;
  positionId: string;
  birthday: string;
  workPreference: string;
  promotionReadiness: string;
  riskLevel: string;
  riskComment: string;
  managerRatingScore: number;
  managerRatingComment: string;
  goalsCurrentPeriod: string;
  hobbies: string;
}

function fromEmployee(e: Employee): Form {
  return {
    fullName: e.fullName,
    role: e.role,
    team: e.team,
    grade: e.grade,
    hireDate: e.hireDate,
    salaryReviewDate: e.salaryReviewDate,
    salary: e.salary,
    email: e.email,
    telegram: e.telegram,
    location: e.location,
    employeeNumber: e.employeeNumber,
    positionId: e.positionId,
    birthday: e.birthday,
    workPreference: e.workPreference || 'гибрид',
    promotionReadiness: e.promotionReadiness,
    riskLevel: e.risk.level,
    riskComment: e.risk.comment,
    managerRatingScore: e.managerRating.score,
    managerRatingComment: e.managerRating.comment,
    goalsCurrentPeriod: e.goalsCurrentPeriod,
    hobbies: e.hobbies,
  };
}

function toPatch(f: Form): Partial<Employee> {
  return {
    fullName: f.fullName.trim(),
    role: f.role.trim(),
    team: f.team.trim(),
    grade: f.grade,
    hireDate: f.hireDate,
    salaryReviewDate: f.salaryReviewDate,
    salary: f.salary,
    email: f.email.trim(),
    telegram: f.telegram.trim(),
    location: f.location.trim(),
    employeeNumber: f.employeeNumber.trim(),
    positionId: f.positionId.trim(),
    birthday: f.birthday,
    workPreference: f.workPreference,
    promotionReadiness: f.promotionReadiness as Employee['promotionReadiness'],
    risk: { level: f.riskLevel as Employee['risk']['level'], comment: f.riskComment.trim() },
    managerRating: { score: f.managerRatingScore, comment: f.managerRatingComment.trim() },
    goalsCurrentPeriod: f.goalsCurrentPeriod.trim(),
    hobbies: f.hobbies.trim(),
  };
}

export function BasicInfoTab({ employee }: { employee: Employee }): JSX.Element {
  const [form, setForm] = useState<Form>(fromEmployee(employee));
  const [dirty, setDirty] = useState(false);

  function patch<K extends keyof Form>(key: K, value: Form[K]): void {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  function handleSave(e: Event): void {
    e.preventDefault();
    if (!form.fullName.trim()) {
      toast.error('ФИО обязательно');
      return;
    }
    employeesRepo.update(employee.id, toPatch(form));
    setDirty(false);
    toast.success('Сохранено');
  }

  function handleReset(): void {
    setForm(fromEmployee(employee));
    setDirty(false);
  }

  return (
    <form onSubmit={handleSave} class="space-y-6">
      <Section title="Идентификация">
        <Grid cols={2}>
          <Field label="ФИО" required>
            {(p) => (
              <TextInput
                {...p}
                value={form.fullName}
                onInput={(e) => patch('fullName', e.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="Email">
            {(p) => (
              <TextInput
                {...p}
                type="email"
                value={form.email}
                onInput={(e) => patch('email', e.currentTarget.value)}
              />
            )}
          </Field>
        </Grid>
        <Grid cols={2}>
          <Field label="Должность">
            {(p) => (
              <TextInput
                {...p}
                value={form.role}
                onInput={(e) => patch('role', e.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="Команда / стрим">
            {(p) => (
              <TextInput
                {...p}
                value={form.team}
                onInput={(e) => patch('team', e.currentTarget.value)}
              />
            )}
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Грейд">
            {(p) => (
              <Select
                {...p}
                value={form.grade}
                onChange={(e) => patch('grade', e.currentTarget.value)}
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Табельный номер">
            {(p) => (
              <TextInput
                {...p}
                value={form.employeeNumber}
                onInput={(e) => patch('employeeNumber', e.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="ID должности">
            {(p) => (
              <TextInput
                {...p}
                value={form.positionId}
                onInput={(e) => patch('positionId', e.currentTarget.value)}
              />
            )}
          </Field>
        </Grid>
        <Grid cols={3}>
          <Field label="Локация">
            {(p) => (
              <TextInput
                {...p}
                value={form.location}
                onInput={(e) => patch('location', e.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="Telegram">
            {(p) => (
              <TextInput
                {...p}
                value={form.telegram}
                onInput={(e) => patch('telegram', e.currentTarget.value)}
                placeholder="@username"
              />
            )}
          </Field>
          <Field label="Дата рождения">
            {(p) => (
              <TextInput
                {...p}
                type="date"
                value={form.birthday}
                onInput={(e) => patch('birthday', e.currentTarget.value)}
              />
            )}
          </Field>
        </Grid>
      </Section>

      <Section title="Трудоустройство и ФОТ">
        <Grid cols={3}>
          <Field label="Дата приёма">
            {(p) => (
              <TextInput
                {...p}
                type="date"
                value={form.hireDate}
                onInput={(e) => patch('hireDate', e.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="Дата последнего пересмотра ФОТ">
            {(p) => (
              <TextInput
                {...p}
                type="date"
                value={form.salaryReviewDate}
                onInput={(e) => patch('salaryReviewDate', e.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="Текущий оклад (₽/мес)">
            {(p) => (
              <TextInput
                {...p}
                type="number"
                min={0}
                step={1000}
                value={form.salary}
                onInput={(e) => {
                  const n = Number(e.currentTarget.value);
                  patch('salary', Number.isFinite(n) ? n : 0);
                }}
              />
            )}
          </Field>
        </Grid>
        <Field label="Предпочтения по работе">
          {(p) => (
            <Select
              {...p}
              value={form.workPreference}
              onChange={(e) => patch('workPreference', e.currentTarget.value)}
            >
              {WORK_PREFS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Section>

      <Section title="Оценка руководителя">
        <Grid cols={2}>
          <Field label="Готовность к повышению">
            {(p) => (
              <Select
                {...p}
                value={form.promotionReadiness}
                onChange={(e) => patch('promotionReadiness', e.currentTarget.value)}
              >
                {PROMOTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Риск ухода">
            {(p) => (
              <Select
                {...p}
                value={form.riskLevel}
                onChange={(e) => patch('riskLevel', e.currentTarget.value)}
              >
                {RISKS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </Grid>
        <Field label="Комментарий по риску">
          {(p) => (
            <TextArea
              {...p}
              value={form.riskComment}
              onInput={(e) => patch('riskComment', e.currentTarget.value)}
              placeholder="Что выводит из равновесия, что удерживает…"
            />
          )}
        </Field>
        <Grid cols={2}>
          <Field label="Оценка (1–5)" hint="Субъективная оценка вклада/результатов">
            {(p) => (
              <TextInput
                {...p}
                type="number"
                min={1}
                max={5}
                value={form.managerRatingScore}
                onInput={(e) => {
                  const n = Number(e.currentTarget.value);
                  if (Number.isFinite(n) && n >= 1 && n <= 5) patch('managerRatingScore', n);
                }}
              />
            )}
          </Field>
          <Field label="Комментарий руководителя">
            {(p) => (
              <TextInput
                {...p}
                value={form.managerRatingComment}
                onInput={(e) => patch('managerRatingComment', e.currentTarget.value)}
              />
            )}
          </Field>
        </Grid>
      </Section>

      <Section title="Прочее">
        <Field label="Цели на текущий период">
          {(p) => (
            <TextArea
              {...p}
              value={form.goalsCurrentPeriod}
              onInput={(e) => patch('goalsCurrentPeriod', e.currentTarget.value)}
            />
          )}
        </Field>
        <Field label="Хобби / интересы">
          {(p) => (
            <TextInput
              {...p}
              value={form.hobbies}
              onInput={(e) => patch('hobbies', e.currentTarget.value)}
            />
          )}
        </Field>
      </Section>

      <footer class="sticky bottom-0 -mx-2 flex items-center justify-end gap-2 border-t border-white/10 bg-slate-950/80 px-2 py-3 backdrop-blur">
        {dirty && <span class="mr-auto text-sm text-amber-300">Есть несохранённые изменения</span>}
        <Button type="button" variant="secondary" onClick={handleReset} disabled={!dirty}>
          Отменить
        </Button>
        <Button type="submit" disabled={!dirty}>
          Сохранить
        </Button>
      </footer>
    </form>
  );
}

// ---------------------------------------------------------------
// Локальные подкомпоненты разметки
// ---------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: preact.ComponentChildren;
}): JSX.Element {
  return (
    <section class="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div class="space-y-3">{children}</div>
    </section>
  );
}

function Grid({
  cols,
  children,
}: {
  cols: 2 | 3;
  children: preact.ComponentChildren;
}): JSX.Element {
  const cls = cols === 3 ? 'grid grid-cols-1 gap-4 md:grid-cols-3' : 'grid grid-cols-1 gap-4 md:grid-cols-2';
  return <div class={cls}>{children}</div>;
}
