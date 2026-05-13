import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { LocationProvider } from 'preact-iso';
import type { ComponentChildren } from 'preact';

vi.mock('@/infra/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { CommandPaletteHost } from '@/ui/components/CommandPaletteHost';
import {
  closeCommandPalette,
  openCommandPalette,
  paletteOpenSignal,
  rankEmployees,
} from '@/state/command-palette';
import { employeesRepo } from '@/infra/repos';
import type { Employee } from '@/data/schema';

function Wrap({ children }: { children: ComponentChildren }): preact.JSX.Element {
  return <LocationProvider>{children}</LocationProvider>;
}

afterEach(() => {
  closeCommandPalette();
  employeesRepo.signal.value = [];
});

describe('CommandPaletteHost', () => {
  it('по умолчанию не отрисован, открывается через сигнал', () => {
    const { container } = render(
      <Wrap>
        <CommandPaletteHost />
      </Wrap>,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    openCommandPalette();
    expect(paletteOpenSignal.value).toBe(true);
  });

  it('хоткей Cmd+K открывает палитру', async () => {
    render(
      <Wrap>
        <CommandPaletteHost />
      </Wrap>,
    );
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeNull();
    });
  });

  it('rankEmployees: фильтрует и ранжирует кандидатов по имени/роли/email', () => {
    const list: Employee[] = [
      { id: 'a', fullName: 'Анна Сидорова', role: 'QA', email: '', team: '', grade: 'Junior' } as never,
      { id: 'b', fullName: 'Борис Петров', role: 'Dev', email: '', team: '', grade: 'Middle' } as never,
      { id: 'c', fullName: 'Григорий', role: 'Борис-консультант', email: '', team: '', grade: 'Junior' } as never,
    ];
    const r = rankEmployees(list, 'борис');
    // Точное совпадение по имени — выше; совпадение в email — ниже
    expect(r[0]?.id).toBe('b');
    expect(r.map((x) => x.id)).toContain('c');
    expect(r.find((x) => x.id === 'a')).toBeUndefined();
  });

  it('rankEmployees: пустой запрос → пустой массив', () => {
    expect(rankEmployees([{ id: 'a', fullName: 'Y' } as never], '')).toEqual([]);
  });

  it('пустой запрос показывает страницы навигации', async () => {
    render(
      <Wrap>
        <CommandPaletteHost />
      </Wrap>,
    );
    openCommandPalette();
    expect(await screen.findByText('Дашборд')).not.toBeNull();
    expect(screen.queryByText('CRM')).not.toBeNull();
  });
});
