import type { ComponentChildren, JSX } from 'preact';
import { useId } from 'preact/hooks';

export interface FieldProps {
  label: string;
  /** Текст подсказки под полем. */
  hint?: string | undefined;
  /** Текст ошибки (если есть — заменяет hint и красит обводку). */
  error?: string | undefined;
  required?: boolean;
  children: (props: { id: string; 'aria-invalid'?: boolean }) => ComponentChildren;
}

/**
 * Обёртка над полем ввода: label + хинт/ошибка + связка id ↔ for.
 * Само поле передаётся через render-prop, чтобы Field не диктовал тип контрола.
 */
export function Field({ label, hint, error, required, children }: FieldProps): JSX.Element {
  const id = useId();
  return (
    <label class="block">
      <span class="mb-1 block text-sm text-slate-300">
        {label}
        {required && <span class="ml-0.5 text-red-400">*</span>}
      </span>
      <span class="block">{children(error ? { id, 'aria-invalid': true } : { id })}</span>
      {(error ?? hint) && (
        <span class={`mt-1 block text-xs ${error ? 'text-red-400' : 'text-slate-500'}`}>
          {error ?? hint}
        </span>
      )}
    </label>
  );
}

/** Готовый текстовый input с базовыми стилями. Используется отдельно или внутри Field. */
export function TextInput(props: JSX.IntrinsicElements['input']): JSX.Element {
  const invalid = props['aria-invalid'];
  return (
    <input
      type="text"
      {...props}
      class={`w-full rounded-lg border bg-white/5 px-3 py-2 outline-none focus:border-blue-500 ${
        invalid ? 'border-red-500/60' : 'border-white/10'
      }`}
    />
  );
}

/** Готовый textarea. */
export function TextArea(props: JSX.IntrinsicElements['textarea']): JSX.Element {
  const invalid = props['aria-invalid'];
  return (
    <textarea
      {...props}
      class={`min-h-[6rem] w-full rounded-lg border bg-white/5 px-3 py-2 outline-none focus:border-blue-500 ${
        invalid ? 'border-red-500/60' : 'border-white/10'
      }`}
    />
  );
}

/** Готовый select. */
export function Select(
  props: JSX.IntrinsicElements['select'] & { children: ComponentChildren },
): JSX.Element {
  const invalid = props['aria-invalid'];
  const { children, ...rest } = props;
  return (
    <select
      {...rest}
      class={`w-full rounded-lg border bg-white/5 px-3 py-2 outline-none focus:border-blue-500 ${
        invalid ? 'border-red-500/60' : 'border-white/10'
      }`}
    >
      {children}
    </select>
  );
}
