import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { LocationProvider } from 'preact-iso';
vi.mock('@/infra/supabase', () => ({ supabase: {} }));
vi.mock('@/infra/auth', () => ({ getSession: vi.fn().mockResolvedValue(null) }));
import { employeesRepo, teamsRepo } from '@/infra/repos';
import { managementRepo } from '@/infra/repos/management';
import { emptyManagement } from '@/data/management';
import { iso } from '@/domain/management';
import { ManagementScreen } from '@/ui/screens/management/ManagementScreen';
const saveMock = vi.fn<typeof managementRepo.save>().mockResolvedValue();
beforeEach(() => {
  saveMock.mockClear();
  history.replaceState(null, '', '/management?area=actions&create=1');
  managementRepo.signal.value = emptyManagement();
  vi.spyOn(managementRepo, 'load').mockResolvedValue();
  vi.spyOn(managementRepo, 'save').mockImplementation(saveMock);
  vi.spyOn(teamsRepo, 'loadAll').mockResolvedValue();
  vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function submit() {
  render(
    <LocationProvider>
      <ManagementScreen embedded />
    </LocationProvider>,
  );
  const title = await screen.findByLabelText(/^Действие/);
  fireEvent.input(title, { target: { value: 'Проверить договорённость' } });
  fireEvent.input(screen.getByLabelText(/^Срок/), { target: { value: iso(new Date()) } });
  fireEvent.click(screen.getByText('Сохранить и добавить в фокус'));
}
it('saves the new action and its focus reference together', async () => {
  await submit();
  await waitFor(() => expect(saveMock).toHaveBeenCalled());
  const saved = saveMock.mock.calls[0]![0];
  expect(saved.actions[0]?.title).toBe('Проверить договорённость');
  expect(saved.focus).toEqual({
    date: iso(new Date()),
    refs: [{ area: 'actions', id: saved.actions[0]!.id }],
  });
});
it('keeps the form open and does not save when focus already contains three actions', async () => {
  managementRepo.signal.value = {
    ...emptyManagement(),
    focus: {
      date: iso(new Date()),
      refs: [1, 2, 3].map((i) => ({ area: 'actions' as const, id: String(i) })),
    },
  };
  await submit();
  expect(await screen.findByText(/В фокусе уже три действия/)).toBeTruthy();
  expect(saveMock).not.toHaveBeenCalled();
});

it('hides completed actions by default and keeps them available through the status filter', async () => {
  history.replaceState(null, '', '/management?area=actions');
  managementRepo.signal.value = {
    ...emptyManagement(),
    actions: [
      {
        id: 'active',
        title: 'Текущее действие',
        type: 'СВОЯ',
        due: '2026-09-30',
        status: 'OPEN',
        assignee: '',
        employeeId: '',
        teamId: '',
        source: '',
      },
      {
        id: 'done',
        title: 'Завершённое действие',
        type: 'СВОЯ',
        due: '2026-09-14',
        status: 'DONE',
        assignee: '',
        employeeId: '',
        teamId: '',
        source: '',
      },
    ],
  };

  render(
    <LocationProvider>
      <ManagementScreen embedded />
    </LocationProvider>,
  );

  expect(await screen.findByRole('button', { name: 'Текущее действие' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Завершённое действие' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Фильтр статуса'), { target: { value: 'DONE' } });
  expect(await screen.findByRole('button', { name: 'Завершённое действие' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Текущее действие' })).toBeNull();
});
