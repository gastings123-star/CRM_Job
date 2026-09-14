import { signal } from '@preact/signals';
import { iso } from '@/domain/management';
export type Progress = Record<string, 'checked' | 'deferred'>;
export const dayProgressVersion = signal(0);
const memory = new Map<string, Progress>();
export const progressKey = (now: Date, closing = false) =>
  `staff-crm-day-checks:${iso(now)}:${closing ? 'close' : 'start'}`;
export function readProgress(key: string): Progress {
  if (memory.has(key)) return memory.get(key)!;
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (!raw || typeof raw !== 'object') return {};
    return Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v === 'checked' || v === 'deferred'),
    );
  } catch {
    return {};
  }
}
export function saveProgress(key: string, progress: Progress): boolean {
  memory.set(key, progress);
  let saved = true;
  try {
    localStorage.setItem(key, JSON.stringify(progress));
  } catch {
    saved = false;
  }
  dayProgressVersion.value++;
  return saved;
}
export function checkStatus(progress: Progress, ids: string[]) {
  const checked = ids.filter((id) => progress[id] === 'checked').length;
  const deferred = ids.filter((id) => progress[id] === 'deferred').length;
  return {
    complete: ids.length > 0 && checked === ids.length,
    started: checked + deferred > 0,
    deferred,
  };
}
window.addEventListener('storage', (e) => {
  if (e.key === null || e.key.startsWith('staff-crm-day-checks:')) {
    if (e.key === null) memory.clear();
    else memory.delete(e.key);
    dayProgressVersion.value++;
  }
});
