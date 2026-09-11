import { useEffect, useState } from 'preact/hooks';
const views = new Map<string, unknown>();
const preserveViews = import.meta.env.MODE !== 'test';
/** Keep list controls across workspace navigation; never persists business data. */
export function useViewState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() =>
    preserveViews && views.has(key) ? (views.get(key) as T) : initial,
  );
  useEffect(() => {
    if (preserveViews) views.set(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}
