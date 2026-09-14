import { afterEach, expect, it, vi } from 'vitest';
import { checkStatus, progressKey, readProgress, saveProgress } from '@/state/day-progress';
afterEach(() => {
  vi.unstubAllGlobals();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
});
it('keeps partial and deferred checks separate from completion', () => {
  expect(checkStatus({ a: 'checked' }, ['a', 'b'])).toEqual({
    started: true,
    complete: false,
    deferred: 0,
  });
  expect(checkStatus({ a: 'checked', b: 'deferred' }, ['a', 'b'])).toEqual({
    started: true,
    complete: false,
    deferred: 1,
  });
  expect(checkStatus({ a: 'checked', b: 'checked' }, ['a', 'b']).complete).toBe(true);
});
it('reads existing marks and keeps dates and morning/evening independent', () => {
  const morning = progressKey(new Date(2026, 8, 14));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key === morning ? '{"a":"checked"}' : null),
  });
  expect(readProgress(morning)).toEqual({ a: 'checked' });
  expect(readProgress(progressKey(new Date(2026, 8, 15)))).toEqual({});
  expect(readProgress(progressKey(new Date(2026, 8, 14), true))).toEqual({});
});
it('retains current-session progress if browser storage fails', () => {
  vi.stubGlobal('localStorage', {
    setItem: () => {
      throw new Error('blocked');
    },
  });
  expect(saveProgress('test', { a: 'checked' })).toBe(false);
  expect(readProgress('test')).toEqual({ a: 'checked' });
});
