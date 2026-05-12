import type { JSX } from 'preact';
import { confirmSignal, resolveConfirm } from '@/state/ui';
import { Modal } from './Modal';
import { Button } from './Button';

/**
 * Глобальный хост для `confirm(...)`. Один на приложение.
 */
export function ConfirmDialogHost(): JSX.Element | null {
  const req = confirmSignal.value;
  if (!req) return null;
  return (
    <Modal open={true} onClose={() => resolveConfirm(false)} title={req.title} maxWidth="sm">
      {req.body && <p class="mb-5 text-sm text-slate-300">{req.body}</p>}
      <div class="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => resolveConfirm(false)}>
          {req.cancelLabel ?? 'Отмена'}
        </Button>
        <Button
          variant={req.danger ? 'danger' : 'primary'}
          onClick={() => resolveConfirm(true)}
        >
          {req.confirmLabel ?? 'Подтвердить'}
        </Button>
      </div>
    </Modal>
  );
}
