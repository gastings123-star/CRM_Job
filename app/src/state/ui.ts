/**
 * Глобальное UI-состояние: тосты и подтверждающие диалоги.
 *
 * Не зависит от Preact-компонентов — это «канал» сигналов, который
 * подписывают визуальные хосты (`ToastHost`, `ConfirmDialogHost`).
 * Позволяет вызывать `toast.success(...)` и `await confirm(...)` из любого
 * места кода (бизнес-логики, инфры), не пробрасывая контекст вручную.
 */
import { signal } from '@preact/signals';

// ---------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  /** Авто-закрытие через N мс. 0 — не закрывать автоматически. */
  duration: number;
}

export const toastsSignal = signal<Toast[]>([]);

function pushToast(kind: ToastKind, message: string, duration = 4000): string {
  const id = crypto.randomUUID();
  toastsSignal.value = [...toastsSignal.value, { id, kind, message, duration }];
  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }
  return id;
}

export function dismissToast(id: string): void {
  toastsSignal.value = toastsSignal.value.filter((t) => t.id !== id);
}

export const toast = {
  info: (m: string, d?: number) => pushToast('info', m, d),
  success: (m: string, d?: number) => pushToast('success', m, d),
  warn: (m: string, d?: number) => pushToast('warn', m, d),
  error: (m: string, d?: number) => pushToast('error', m, d ?? 6000),
};

// ---------------------------------------------------------------
// Confirm-диалоги
// ---------------------------------------------------------------

export interface ConfirmRequest {
  id: string;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

export const confirmSignal = signal<ConfirmRequest | null>(null);

/**
 * Показать модалку подтверждения. Возвращает promise<boolean>.
 * Использовать вместо `window.confirm(...)`.
 */
export function confirm(opts: {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const req: ConfirmRequest = {
      id: crypto.randomUUID(),
      title: opts.title,
      resolve,
    };
    if (opts.body !== undefined) req.body = opts.body;
    if (opts.confirmLabel !== undefined) req.confirmLabel = opts.confirmLabel;
    if (opts.cancelLabel !== undefined) req.cancelLabel = opts.cancelLabel;
    if (opts.danger !== undefined) req.danger = opts.danger;
    confirmSignal.value = req;
  });
}

export function resolveConfirm(ok: boolean): void {
  const current = confirmSignal.value;
  if (!current) return;
  confirmSignal.value = null;
  current.resolve(ok);
}
