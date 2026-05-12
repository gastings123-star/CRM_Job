import type { JSX } from 'preact';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60';

const variants: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-500',
  secondary: 'border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10',
  ghost: 'text-slate-300 hover:bg-white/5',
  danger: 'bg-red-600 text-white hover:bg-red-500',
};

const sizes: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-sm',
  md: 'px-4 py-2',
};

export type ButtonProps = JSX.IntrinsicElements['button'] & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = 'primary',
  size = 'md',
  class: cls = '',
  className,
  ...rest
}: ButtonProps): JSX.Element {
  const extra = typeof className === 'string' ? className : '';
  return (
    <button
      {...rest}
      class={`${base} ${variants[variant]} ${sizes[size]} ${typeof cls === 'string' ? cls : ''} ${extra}`.trim()}
    />
  );
}
