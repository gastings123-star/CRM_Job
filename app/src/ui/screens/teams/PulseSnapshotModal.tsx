import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { PulseEscalationKind, PulseStatus, TeamPulseSnapshot } from '@/data/schema';
import { TeamPulseSnapshotSchema } from '@/data/schema';
import { pulseRepo } from '@/infra/repos';
import { confirm, toast } from '@/state/ui';
import { Button } from '@/ui/components/Button';
import { Field, Select, TextArea, TextInput } from '@/ui/components/Field';
import { Modal } from '@/ui/components/Modal';

/**
 * Модалка «Снэпшот за неделю» — создание или редактирование.
 *
 * Логика prefill:
 *  - если `existing` есть — берём из него;
 *  - иначе если есть `previous` (прошлая неделя) — копируем статус/tailIndex
 *    («как было», эскалации 0, note очищена);
 *  - иначе пустой шаблон.
 *
 * При сохранении пишем через `pulseRepo.create()`/`update()`. Уникальность
 * (teamId, weekStart) гарантируется уникальным индексом БД и стабильным
 * `id` для существующих записей.
 */
const STATUSES: { value: PulseStatus; label: string }[] = [
  { value: 'green', label: '🟢 зелёный' },
  { value: 'yellow', label: '🟡 жёлтый' },
  { value: 'red', label: '🔴 красный' },
];

const KINDS: { value: PulseEscalationKind | ''; label: string }[] = [
  { value: '', label: '—' },
  { value: 'decision', label: 'решение' },
  { value: 'resource', label: 'ресурс' },
  { value: 'communication', label: 'коммуникация' },
];

export interface PulseSnapshotModalProps {
  open: boolean;
  weekStart: string;
  teamId: string;
  teamName: string;
  existing?: TeamPulseSnapshot | undefined;
  previous?: TeamPulseSnapshot | undefined;
  onClose: () => void;
}

export function PulseSnapshotModal(props: PulseSnapshotModalProps): JSX.Element | null {
  if (!props.open) return null;
  return (
    <Modal open onClose={props.onClose} title={titleFor(props)} maxWidth="lg">
      <PulseSnapshotForm {...props} />
    </Modal>
  );
}

function titleFor(p: PulseSnapshotModalProps): string {
  const verb = p.existing ? 'Обновить' : 'Снэпшот';
  return `${verb} · ${p.teamName} · нед. ${p.weekStart}`;
}

function PulseSnapshotForm({
  weekStart,
  teamId,
  existing,
  previous,
  onClose,
}: PulseSnapshotModalProps): JSX.Element {
  const initial = existing ?? previousAsInitial(previous);
  const [status, setStatus] = useState<PulseStatus>(initial.status);
  const [tailIndex, setTailIndex] = useState<number>(initial.tailIndex);
  const [escalations, setEscalations] = useState<number>(initial.escalations);
  const [escalationKind, setEscalationKind] = useState<PulseEscalationKind | ''>(
    initial.escalationKind ?? '',
  );
  const [note, setNote] = useState<string>(initial.note);

  // Если приходит другой existing/previous (например, перенаправили модалку
  // на соседнюю неделю), сбрасываем состояние.
  useEffect(() => {
    const i = existing ?? previousAsInitial(previous);
    setStatus(i.status);
    setTailIndex(i.tailIndex);
    setEscalations(i.escalations);
    setEscalationKind(i.escalationKind ?? '');
    setNote(i.note);
  }, [existing, previous]);

  function applyAsPrevious(): void {
    if (!previous) return;
    setStatus(previous.status);
    setTailIndex(previous.tailIndex);
    setEscalations(0);
    setEscalationKind('');
    setNote('');
  }

  function handleSave(e: Event): void {
    e.preventDefault();
    const draft = {
      id: existing?.id ?? crypto.randomUUID(),
      teamId,
      weekStart,
      status,
      tailIndex,
      escalations,
      escalationKind: escalationKind === '' ? null : escalationKind,
      note: note.trim(),
    };
    const parsed = TeamPulseSnapshotSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error(`Не удалось сохранить: ${parsed.error.issues[0]?.message ?? 'валидация'}`);
      return;
    }
    if (existing) {
      pulseRepo.update(existing.id, parsed.data);
      toast.success('Снэпшот обновлён');
    } else {
      pulseRepo.create(parsed.data);
      toast.success('Снэпшот сохранён');
    }
    onClose();
  }

  async function handleDelete(): Promise<void> {
    if (!existing) return;
    const ok = await confirm({
      title: 'Удалить снэпшот за неделю?',
      body: `Будет удалена запись от ${existing.weekStart}. Действие необратимо.`,
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    pulseRepo.remove(existing.id);
    toast.success('Снэпшот удалён');
    onClose();
  }

  function setEsc(v: PulseEscalationKind | ''): void {
    setEscalationKind(v);
  }

  return (
    <form onSubmit={handleSave} class="space-y-4">
      {previous && !existing && (
        <button
          type="button"
          onClick={applyAsPrevious}
          class="w-full rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-200 transition-colors hover:bg-blue-500/20"
        >
          Как на прошлой неделе ({previous.weekStart}):{' '}
          <span class="font-semibold">{statusGlyph(previous.status)}</span> хвосты {previous.tailIndex}/10
        </button>
      )}

      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Статус">
          {(p) => (
            <Select
              {...p}
              value={status}
              onChange={(e) => setStatus(e.currentTarget.value as PulseStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Хвосты (0..10)">
          {(p) => (
            <TextInput
              {...p}
              type="number"
              min={0}
              max={10}
              step={1}
              value={tailIndex}
              onInput={(e) => setTailIndex(clamp(Number(e.currentTarget.value), 0, 10))}
            />
          )}
        </Field>
        <Field label="Эскалации (шт)">
          {(p) => (
            <TextInput
              {...p}
              type="number"
              min={0}
              step={1}
              value={escalations}
              onInput={(e) => setEscalations(Math.max(0, Number(e.currentTarget.value) || 0))}
            />
          )}
        </Field>
      </div>

      <Field label="Тип главной эскалации">
        {(p) => (
          <Select
            {...p}
            value={escalationKind}
            onChange={(e) => setEsc(e.currentTarget.value as PulseEscalationKind | '')}
          >
            {KINDS.map((k) => (
              <option key={k.value || 'none'} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="Заметка" hint="одна строка свободного текста — что важного на неделе">
        {(p) => (
          <TextArea
            {...p}
            value={note}
            onInput={(e) => setNote(e.currentTarget.value)}
            class="min-h-[5rem]"
          />
        )}
      </Field>

      <div class="flex items-center gap-2 pt-2">
        {existing && (
          <Button type="button" variant="danger" size="sm" onClick={() => void handleDelete()}>
            Удалить
          </Button>
        )}
        <div class="ml-auto flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit">{existing ? 'Сохранить' : 'Создать'}</Button>
        </div>
      </div>
    </form>
  );
}

function previousAsInitial(prev: TeamPulseSnapshot | undefined): {
  status: PulseStatus;
  tailIndex: number;
  escalations: number;
  escalationKind: PulseEscalationKind | null;
  note: string;
} {
  if (!prev) {
    return { status: 'green', tailIndex: 0, escalations: 0, escalationKind: null, note: '' };
  }
  // По умолчанию переносим «температуру» прошлой недели, но эскалации/заметку
  // не наследуем — это всегда про конкретную неделю.
  return {
    status: prev.status,
    tailIndex: prev.tailIndex,
    escalations: 0,
    escalationKind: null,
    note: '',
  };
}

function statusGlyph(s: PulseStatus): string {
  return s === 'green' ? '🟢' : s === 'yellow' ? '🟡' : '🔴';
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}
