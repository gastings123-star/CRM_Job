import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ComponentChildren;
  /** Максимальная ширина содержимого. */
  maxWidth?: 'sm' | 'md' | 'lg';
}

const widths: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

/**
 * Простая модалка: тёмная подложка, центрированная карточка,
 * закрытие по Esc и клику по фону, фокус-ловушка на первом focusable.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'md',
}: ModalProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Перенести фокус внутрь модалки.
    queueMicrotask(() => {
      const node = dialogRef.current;
      if (!node) return;
      const focusable = node.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? node).focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      if (lastFocused.current instanceof HTMLElement) lastFocused.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        class={`w-full ${widths[maxWidth]} rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-xl outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 class="mb-4 text-lg font-semibold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
