import { theme, setTheme } from '@/state/theme';
export function ThemeToggle() {
  const light = theme.value === 'light';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={light}
      aria-label="Светлая тема"
      title={light ? 'Переключить на тёмную тему' : 'Переключить на светлую тему'}
      class="whitespace-nowrap rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/10"
      onClick={() => setTheme(light ? 'dark' : 'light')}
    >
      {light ? '☀ Светлая' : '☾ Тёмная'}
    </button>
  );
}
