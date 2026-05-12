import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirm, confirmSignal, dismissToast, resolveConfirm, toast, toastsSignal } from '@/state/ui';

afterEach(() => {
  toastsSignal.value = [];
  confirmSignal.value = null;
  vi.useRealTimers();
});

describe('toasts', () => {
  it('toast.info добавляет элемент в toastsSignal', () => {
    expect(toastsSignal.value).toHaveLength(0);
    toast.info('hello', 0);
    expect(toastsSignal.value).toHaveLength(1);
    expect(toastsSignal.value[0]?.kind).toBe('info');
    expect(toastsSignal.value[0]?.message).toBe('hello');
  });

  it('dismissToast удаляет конкретный тост по id', () => {
    const id1 = toast.success('a', 0);
    const id2 = toast.warn('b', 0);
    expect(toastsSignal.value).toHaveLength(2);
    dismissToast(id1);
    expect(toastsSignal.value).toHaveLength(1);
    expect(toastsSignal.value[0]?.id).toBe(id2);
  });

  it('тост авто-исчезает через duration мс', () => {
    vi.useFakeTimers();
    toast.info('auto', 1000);
    expect(toastsSignal.value).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(toastsSignal.value).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(toastsSignal.value).toHaveLength(0);
  });
});

describe('confirm', () => {
  it('confirm(...) кладёт запрос в сигнал и резолвится после resolveConfirm', async () => {
    const p = confirm({ title: 'Удалить?' });
    expect(confirmSignal.value?.title).toBe('Удалить?');
    resolveConfirm(true);
    await expect(p).resolves.toBe(true);
    expect(confirmSignal.value).toBeNull();
  });

  it('resolveConfirm(false) возвращает false', async () => {
    const p = confirm({ title: 'Сбросить?' });
    resolveConfirm(false);
    await expect(p).resolves.toBe(false);
  });

  it('resolveConfirm без активного запроса безопасен', () => {
    confirmSignal.value = null;
    expect(() => resolveConfirm(true)).not.toThrow();
  });
});
