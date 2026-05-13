import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/preact';
import { LocationProvider } from 'preact-iso';
import type { ComponentChildren } from 'preact';

vi.mock('@/infra/supabase', () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
  },
}));

import { employeesRepo } from '@/infra/repos';
import { CrmScreen } from '@/ui/screens/crm/CrmScreen';
import { toastsSignal, confirmSignal } from '@/state/ui';

function Wrap({ children }: { children: ComponentChildren }): preact.JSX.Element {
  return <LocationProvider>{children}</LocationProvider>;
}

afterEach(() => {
  employeesRepo.signal.value = [];
  toastsSignal.value = [];
  confirmSignal.value = null;
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

function namesInOrder(): string[] {
  const rows = within(screen.getByRole('table')).getAllByRole('row');
  // первая строка — thead; пропускаем
  return rows.slice(1).map((r) => {
    const buttons = r.querySelectorAll('button');
    return buttons[0]?.textContent?.trim() ?? '';
  });
}

describe('CrmScreen — сортировка колонок', () => {
  it('по умолчанию: ФИО по возрастанию', () => {
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    employeesRepo.signal.value = [
      { id: '3', fullName: 'Сидоров', role: 'Dev', email: '', grade: 'Junior', hireDate: '' } as never,
      { id: '1', fullName: 'Анна', role: 'QA', email: '', grade: 'Senior', hireDate: '' } as never,
      { id: '2', fullName: 'Борис', role: 'Dev', email: '', grade: 'Middle', hireDate: '' } as never,
    ];
    render(
      <Wrap>
        <CrmScreen />
      </Wrap>,
    );
    expect(namesInOrder()).toEqual(['Анна', 'Борис', 'Сидоров']);
  });

  it('клик на «Грейд» сортирует по уровню (Junior→Middle→Senior), второй клик → desc', () => {
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    employeesRepo.signal.value = [
      { id: '1', fullName: 'A', role: '', email: '', grade: 'Senior', hireDate: '' } as never,
      { id: '2', fullName: 'B', role: '', email: '', grade: 'Junior', hireDate: '' } as never,
      { id: '3', fullName: 'C', role: '', email: '', grade: 'Middle', hireDate: '' } as never,
    ];
    render(
      <Wrap>
        <CrmScreen />
      </Wrap>,
    );
    fireEvent.click(screen.getByRole('button', { name: /грейд/i }));
    expect(namesInOrder()).toEqual(['B', 'C', 'A']); // Junior, Middle, Senior
    fireEvent.click(screen.getByRole('button', { name: /грейд/i }));
    expect(namesInOrder()).toEqual(['A', 'C', 'B']); // desc
  });

  it('третий клик снимает сортировку и возвращает исходный порядок', () => {
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    employeesRepo.signal.value = [
      { id: '1', fullName: 'Z', role: '', email: '', grade: 'Junior', hireDate: '' } as never,
      { id: '2', fullName: 'A', role: '', email: '', grade: 'Middle', hireDate: '' } as never,
    ];
    render(
      <Wrap>
        <CrmScreen />
      </Wrap>,
    );
    // sort by ФИО — изначально asc (по умолчанию), клик → desc, клик → off
    const fullName = screen.getByRole('button', { name: /^ФИО/i });
    expect(namesInOrder()).toEqual(['A', 'Z']);
    fireEvent.click(fullName);
    expect(namesInOrder()).toEqual(['Z', 'A']);
    fireEvent.click(fullName);
    // сортировка снята → исходный порядок массива
    expect(namesInOrder()).toEqual(['Z', 'A']);
  });
});
