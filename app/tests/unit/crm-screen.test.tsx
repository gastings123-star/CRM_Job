import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { LocationProvider } from 'preact-iso';
import type { ComponentChildren } from 'preact';

// supabase мочим в no-op, чтобы `loadAll()` не падал и не делал сети.
vi.mock('@/infra/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
    }),
  },
}));

import { employeesRepo } from '@/infra/repos';
import { CrmScreen } from '@/ui/screens/crm/CrmScreen';
import { EmployeeForm } from '@/ui/screens/crm/EmployeeForm';
import { confirmSignal, toastsSignal } from '@/state/ui';

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

describe('CrmScreen', () => {
  it('показывает empty-state, когда сотрудников нет', async () => {
    render(
      <Wrap>
        <CrmScreen />
      </Wrap>,
    );
    expect(await screen.findByText(/пока ни одного сотрудника/i)).not.toBeNull();
  });

  it('фильтр по запросу скрывает не подходящие записи', async () => {
    // loadAll() при монтировании затирает signal — мокаем его в no-op.
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    employeesRepo.signal.value = [
      { id: '1', fullName: 'Анна', role: 'QA', email: '', grade: 'Junior' } as never,
      { id: '2', fullName: 'Борис', role: 'Dev', email: '', grade: 'Middle' } as never,
    ];
    render(
      <Wrap>
        <CrmScreen />
      </Wrap>,
    );

    expect(screen.queryByText('Анна')).not.toBeNull();
    expect(screen.queryByText('Борис')).not.toBeNull();

    const search = screen.getByPlaceholderText(/поиск по имени/i);
    fireEvent.input(search, { target: { value: 'борис' } });

    await waitFor(() => {
      expect(screen.queryByText('Анна')).toBeNull();
    });
    expect(screen.queryByText('Борис')).not.toBeNull();
  });
});

// ---------------------------------------------------------------
// EmployeeForm — изолированный тест формы.
// ---------------------------------------------------------------

describe('EmployeeForm', () => {
  it('валидация: пустое ФИО → ошибка, onSubmit не вызывается', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<EmployeeForm onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.queryByText(/обязательное поле/i)).not.toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('заполнение ФИО и сабмит → onSubmit получает trimmed значения', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<EmployeeForm onSubmit={onSubmit} onCancel={onCancel} />);

    const fullName = screen.getByPlaceholderText(/иван иванов/i);
    fireEvent.input(fullName, { target: { value: '  Анна Сидорова  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0]?.[0] as { fullName: string };
    expect(arg.fullName).toBe('Анна Сидорова');
  });

  it('initial: значения подставляются в форму при редактировании', () => {
    const onSubmit = vi.fn();
    const initial = {
      id: 'e1',
      fullName: 'Анна',
      role: 'QA',
      grade: 'Middle',
      hireDate: '2024-01-01',
      email: 'a@b.c',
      salary: 100000,
    } as never;
    render(<EmployeeForm initial={initial} onSubmit={onSubmit} onCancel={() => undefined} />);

    const fullNameEl = screen.getByPlaceholderText(/иван иванов/i);
    if (!(fullNameEl instanceof HTMLInputElement)) throw new Error('expected input');
    expect(fullNameEl.value).toBe('Анна');
    expect(screen.getByDisplayValue('QA')).not.toBeNull();
  });

  it('cancel вызывает onCancel', () => {
    const onCancel = vi.fn();
    render(<EmployeeForm onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
