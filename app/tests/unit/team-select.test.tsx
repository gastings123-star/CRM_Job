import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { signal } from '@preact/signals';
vi.mock('@/infra/repos', () => ({
  teamsRepo: {
    signal: signal([{ id: 't1', name: 'City+' }]),
    loadAll: vi.fn().mockResolvedValue(undefined),
  },
}));
import { EmployeeForm } from '@/ui/screens/crm/EmployeeForm';
import { TeamSelect } from '@/ui/screens/crm/TeamSelect';
afterEach(cleanup);
describe('Employee team selection', () => {
  it('submits the team selected when creating an employee', () => {
    const submit = vi.fn();
    render(<EmployeeForm onSubmit={submit} onCancel={vi.fn()} />);
    fireEvent.input(screen.getByLabelText(/ФИО/), { target: { value: 'Тест' } });
    fireEvent.change(screen.getByLabelText(/^Команда/), { target: { value: 'City+' } });
    fireEvent.click(screen.getByText('Сохранить'));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'Тест', team: 'City+' }),
    );
  });
  it('preserves a legacy team absent from the directory', () => {
    render(<TeamSelect value="Прежняя команда" onChange={vi.fn()} />);
    expect(screen.getByLabelText<HTMLSelectElement>(/^Команда/).value).toBe('Прежняя команда');
    expect(screen.getByText('City+')).toBeTruthy();
  });
});
