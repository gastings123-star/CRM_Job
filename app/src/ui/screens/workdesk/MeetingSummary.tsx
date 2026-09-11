import { useState } from 'preact/hooks';
import { managementRepo } from '@/infra/repos/management';
import { recordMeeting, type FollowUp } from '@/domain/meeting-summary';
import { iso } from '@/domain/management';
import { Field, TextInput, TextArea } from '@/ui/components/Field';
import { Button } from '@/ui/components/Button';
export function MeetingSummary({ openAction }: { openAction: (id: string) => void }) {
  const s = managementRepo.signal.value;
  const [id, setId] = useState(() => crypto.randomUUID()),
    [title, setTitle] = useState(''),
    [date, setDate] = useState(() => iso(new Date())),
    [decision, setDecision] = useState(''),
    [participants, setParticipants] = useState(''),
    [source, setSource] = useState(''),
    [close, setClose] = useState(false),
    [followUps, setFollowUps] = useState<FollowUp[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  function patch(index: number, value: Partial<FollowUp>) {
    setFollowUps((rows) => rows.map((r, i) => (i === index ? { ...r, ...value } : r)));
  }
  async function save(e: Event) {
    e.preventDefault();
    if (busy || saved) return;
    setBusy(true);
    setError('');
    try {
      await managementRepo.save(
        recordMeeting(
          managementRepo.signal.value,
          {
            id,
            title,
            date,
            decision,
            participants,
            sourceActionId: source,
            closeSource: close,
            followUps,
          },
          () => crypto.randomUUID(),
        ),
      );
      setSaved(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div class="space-y-5">
      <h3 class="text-xl font-semibold">Итог встречи</h3>
      <p class="text-sm leading-6 text-slate-400">
        Запишите состоявшуюся договорённость. Добавьте только те действия, которые требуют вашего
        личного контроля. Сотрудник не переводится в другую команду автоматически.
      </p>
      {saved ? (
        <section class="rounded-xl border border-green-400/20 p-4">
          <h4 class="font-medium">Итог и действия сохранены</h4>
          <p class="mt-2 whitespace-pre-wrap text-sm">{decision}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            {s.meetingNotes
              ?.find((m) => m.id === id)
              ?.actionIds.map((actionId) => (
                <Button key={actionId} variant="secondary" onClick={() => openAction(actionId)}>
                  {s.actions.find((a) => a.id === actionId)?.title ?? 'Действие удалено'}
                </Button>
              ))}
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setId(crypto.randomUUID());
              setTitle('');
              setDecision('');
              setParticipants('');
              setSource('');
              setClose(false);
              setFollowUps([]);
              setSaved(false);
            }}
          >
            Записать другую встречу
          </Button>
        </section>
      ) : (
        <form class="space-y-4" onSubmit={(e) => void save(e)}>
          <Field label="Тема встречи" required>
            {(p) => (
              <TextInput
                {...p}
                required
                value={title}
                onInput={(e) => setTitle(e.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="Дата встречи" required>
            {(p) => (
              <TextInput
                {...p}
                required
                type="date"
                value={date}
                onInput={(e) => setDate(e.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="Участники">
            {(p) => (
              <TextInput
                {...p}
                value={participants}
                onInput={(e) => setParticipants(e.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="Что решили" required>
            {(p) => (
              <TextArea
                {...p}
                required
                value={decision}
                onInput={(e) => setDecision(e.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="Связать с действием о встрече (необязательно)">
            {(p) => (
              <select
                {...p}
                class="mos-input w-full"
                value={source}
                onChange={(e) => {
                  setSource(e.currentTarget.value);
                  setClose(false);
                }}
              >
                <option value="">Без связи</option>
                {s.actions
                  .filter((a) => a.status !== 'DONE')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
              </select>
            )}
          </Field>
          {source && (
            <label class="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={close}
                onChange={(e) => setClose(e.currentTarget.checked)}
              />
              Встреча состоялась — закрыть выбранное действие
            </label>
          )}
          {followUps.map((f, i) => (
            <fieldset key={i} class="space-y-3 rounded-xl border border-white/10 p-3">
              <legend class="px-1 text-sm">Следующее действие {i + 1}</legend>
              <Field label="Уже есть в Реестре?">
                {(p) => (
                  <select
                    {...p}
                    class="mos-input w-full"
                    value={f.existingId}
                    onChange={(e) => patch(i, { existingId: e.currentTarget.value })}
                  >
                    <option value="">Создать новое</option>
                    {s.actions
                      .filter((a) => a.status !== 'DONE')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title}
                        </option>
                      ))}
                  </select>
                )}
              </Field>
              {!f.existingId && (
                <>
                  <Field label="Что сделать" required>
                    {(p) => (
                      <TextInput
                        {...p}
                        required
                        value={f.title}
                        onInput={(e) => patch(i, { title: e.currentTarget.value })}
                      />
                    )}
                  </Field>
                  <Field label="Кто делает (пусто — я)">
                    {(p) => (
                      <TextInput
                        {...p}
                        value={f.assignee}
                        onInput={(e) => patch(i, { assignee: e.currentTarget.value })}
                      />
                    )}
                  </Field>
                  <Field label="Срок / дата контроля" required>
                    {(p) => (
                      <TextInput
                        {...p}
                        required
                        type="date"
                        value={f.due}
                        onInput={(e) => patch(i, { due: e.currentTarget.value })}
                      />
                    )}
                  </Field>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setFollowUps((rows) => rows.filter((_, n) => n !== i))}
              >
                Убрать действие
              </Button>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setFollowUps((rows) => [
                ...rows,
                { title: '', due: '', assignee: '', existingId: '' },
              ])
            }
          >
            Добавить следующее действие
          </Button>
          <p class="text-xs text-slate-500">
            Если следующих действий нет, достаточно сохранить решение.
          </p>
          {error && (
            <p role="alert" class="text-sm text-red-200">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Сохраняется…' : 'Сохранить итог встречи'}
          </Button>
        </form>
      )}
      <details class="border-t border-white/10 pt-4">
        <summary class="cursor-pointer text-sm text-slate-400">
          История встреч · {s.meetingNotes?.length ?? 0}
        </summary>
        {[...(s.meetingNotes ?? [])].reverse().map((m) => (
          <article key={m.id} class="mt-3 rounded-lg border border-white/10 p-3">
            <h4 class="text-sm font-medium">
              {m.date} · {m.title}
            </h4>
            <p class="mt-2 whitespace-pre-wrap text-sm text-slate-300">{m.decision}</p>
            <p class="mt-1 text-xs text-slate-500">{m.participants}</p>
            {m.actionIds.map((actionId) => (
              <button
                key={actionId}
                class="mt-2 block text-sm text-blue-200"
                disabled={!s.actions.some((a) => a.id === actionId)}
                onClick={() => openAction(actionId)}
              >
                {s.actions.find((a) => a.id === actionId)?.title ?? 'Действие удалено'}
              </button>
            ))}
          </article>
        ))}
      </details>
    </div>
  );
}
