import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { ThemeToggle } from '@/ui/components/ThemeToggle';
import { applyTheme, readTheme } from '@/state/theme';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  applyTheme('dark');
});
it('switches the document palette and stores the choice', () => {
  const setItem = vi.fn();
  vi.stubGlobal('localStorage', { setItem });
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole('switch'));
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(setItem).toHaveBeenCalledWith('staff-crm-theme', 'light');
  fireEvent.click(screen.getByRole('switch'));
  expect(document.documentElement.dataset.theme).toBe('dark');
});
it('restores light and tolerates unavailable storage', () => {
  const getItem = vi.fn().mockReturnValue('light');
  vi.stubGlobal('localStorage', { getItem });
  expect(readTheme()).toBe('light');
  getItem.mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(readTheme()).toBe('dark');
});
