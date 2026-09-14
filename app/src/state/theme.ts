import { signal } from '@preact/signals';
export type Theme = 'light' | 'dark';
const key = 'staff-crm-theme';
export function readTheme(): Theme {
  try {
    return localStorage.getItem(key) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}
export const theme = signal<Theme>(readTheme());
export function applyTheme(value: Theme) {
  theme.value = value;
  document.documentElement.dataset.theme = value;
  document.documentElement.style.colorScheme = value;
}
export function setTheme(value: Theme) {
  applyTheme(value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Session choice still works. */
  }
}
