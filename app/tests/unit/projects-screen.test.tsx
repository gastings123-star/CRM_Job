import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { LocationProvider } from 'preact-iso';
import type { ComponentChildren } from 'preact';

vi.mock('@/infra/supabase', () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
  },
}));

import { employeesRepo, projectsRepo } from '@/infra/repos';
import { ProjectsScreen } from '@/ui/screens/projects/ProjectsScreen';
import { confirmSignal, toastsSignal } from '@/state/ui';
import type { Project, Employee } from '@/data/schema';

function Wrap({ children }: { children: ComponentChildren }): preact.JSX.Element {
  return <LocationProvider>{children}</LocationProvider>;
}

function proj(id: string, name: string, status = 'активный'): Project {
  return { id, name, status };
}

function empWithProjects(...projects: string[]): Employee {
  return {
    id: Math.random().toString(36).slice(2),
    load: { projects } as unknown as Employee['load'],
  } as unknown as Employee;
}

afterEach(() => {
  projectsRepo.signal.value = [];
  employeesRepo.signal.value = [];
  toastsSignal.value = [];
  confirmSignal.value = null;
  vi.restoreAllMocks();
});

describe('ProjectsScreen', () => {
  it('пустой справочник → empty-state', () => {
    vi.spyOn(projectsRepo, 'loadAll').mockResolvedValue(undefined);
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    render(
      <Wrap>
        <ProjectsScreen />
      </Wrap>,
    );
    expect(screen.getByText(/проектов ещё нет/i)).not.toBeNull();
  });

  it('счётчик сотрудников считает упоминания в load.projects', () => {
    vi.spyOn(projectsRepo, 'loadAll').mockResolvedValue(undefined);
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    projectsRepo.signal.value = [proj('p1', 'Pre-fill'), proj('p2', 'Атрибуты')];
    employeesRepo.signal.value = [
      empWithProjects('Pre-fill', 'Атрибуты'),
      empWithProjects('Pre-fill'),
      empWithProjects('Другое'),
    ];
    render(
      <Wrap>
        <ProjectsScreen />
      </Wrap>,
    );
    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    // первая строка — Pre-fill (2), вторая — Атрибуты (1)
    expect(rows[0]?.textContent).toContain('2');
    expect(rows[1]?.textContent).toContain('1');
  });

  it('поиск по статусу фильтрует строки', async () => {
    vi.spyOn(projectsRepo, 'loadAll').mockResolvedValue(undefined);
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    projectsRepo.signal.value = [
      proj('a', 'A', 'активный'),
      proj('b', 'B', 'на паузе'),
    ];
    render(
      <Wrap>
        <ProjectsScreen />
      </Wrap>,
    );
    const search = screen.getByPlaceholderText(/поиск/i);
    fireEvent.input(search, { target: { value: 'паузе' } });
    await waitFor(() => {
      expect(screen.queryByText('A')).toBeNull();
    });
    expect(screen.queryByText('B')).not.toBeNull();
  });

  it('Add → projectsRepo.create', async () => {
    vi.spyOn(projectsRepo, 'loadAll').mockResolvedValue(undefined);
    vi.spyOn(employeesRepo, 'loadAll').mockResolvedValue(undefined);
    const create = vi.spyOn(projectsRepo, 'create').mockImplementation(() => undefined);
    render(
      <Wrap>
        <ProjectsScreen />
      </Wrap>,
    );
    fireEvent.click(screen.getByRole('button', { name: /добавить проект/i }));
    const nameField = await screen.findByPlaceholderText(/атрибуты клиента/i);
    fireEvent.input(nameField, { target: { value: 'Новый' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(create).toHaveBeenCalledTimes(1);
    const [created] = create.mock.calls[0]!;
    expect(created).toMatchObject({ name: 'Новый', status: 'активный' });
  });
});
