import type { JSX } from 'preact';
import { LocationProvider, Route, Router, useLocation } from 'preact-iso';
import type { Session } from '@supabase/supabase-js';
import { signOut } from '@/infra/auth';
import { syncQueue, type SyncStatus } from '@/infra/sync';
import { useEffect, useState } from 'preact/hooks';
import { employeeDetailPath, navItems, routes, type RouteKey } from './routes';
import { Placeholder } from '@/ui/screens/Placeholder';
import { CrmScreen } from '@/ui/screens/crm/CrmScreen';
import { EmployeeDetailScreen } from '@/ui/screens/crm/EmployeeDetail';
import { SettingsScreen } from '@/ui/screens/settings/SettingsScreen';
import { DashboardScreen } from '@/ui/screens/dashboard/DashboardScreen';
import { TeamsScreen } from '@/ui/screens/teams/TeamsScreen';
import { ProjectsScreen } from '@/ui/screens/projects/ProjectsScreen';
import { CalendarScreen } from '@/ui/screens/calendar/CalendarScreen';
import { DevelopmentScreen } from '@/ui/screens/development/DevelopmentScreen';
import { PersonalScreen } from '@/ui/screens/personal/PersonalScreen';
import { ToastHost } from '@/ui/components/ToastHost';
import { ConfirmDialogHost } from '@/ui/components/ConfirmDialogHost';
import { CommandPaletteHost } from '@/ui/components/CommandPaletteHost';
import { openCommandPalette } from '@/state/command-palette';

/**
 * Авторизованная часть приложения: топ-бар, навигация, область контента.
 * AuthGate отдаёт сюда session, дальнейшее зависит только от роутера.
 */
export function AppShell({ session }: { session: Session }): JSX.Element {
  return (
    <LocationProvider>
      <div class="min-h-screen">
        <TopBar session={session} />
        <main class="mx-auto max-w-7xl p-6">
          <Router>
            <Route path={routes.dashboard.path} component={DashboardScreen} />
            <Route path={routes.crm.path} component={CrmScreen} />
            <Route path={employeeDetailPath} component={EmployeeDetailScreen} />
            <Route path={routes.teams.path} component={TeamsScreen} />
            <Route path={routes.calendar.path} component={CalendarScreen} />
            <Route path={routes.development.path} component={DevelopmentScreen} />
            <Route path={routes.personal.path} component={PersonalScreen} />
            <Route path={routes.projects.path} component={ProjectsScreen} />
            <Route path={routes.settings.path} component={SettingsScreen} />
            <Route default component={NotFoundScreen} />
          </Router>
        </main>
        <ToastHost />
        <ConfirmDialogHost />
        <CommandPaletteHost />
      </div>
    </LocationProvider>
  );
}

// ---------------------------------------------------------------
// TopBar + навигация
// ---------------------------------------------------------------

function TopBar({ session }: { session: Session }): JSX.Element {
  const [sync, setSync] = useState<SyncStatus>(syncQueue.getStatus());

  useEffect(() => {
    syncQueue.start();
    const off = syncQueue.subscribe(setSync);
    return () => {
      off();
      syncQueue.stop();
    };
  }, []);

  return (
    <header class="sticky top-0 z-30 border-b border-white/10 bg-slate-950/80 backdrop-blur">
      <div class="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        <h1 class="text-lg font-semibold">Staff CRM</h1>
        <Nav />
        <div class="ml-auto flex items-center gap-4">
          <button
            type="button"
            onClick={() => openCommandPalette()}
            class="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10 md:inline-flex"
            title="Поиск / навигация (Cmd+K)"
          >
            <span>Поиск</span>
            <span class="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">⌘K</span>
          </button>
          <SyncBadge status={sync} />
          <span class="hidden text-sm text-slate-400 sm:inline">{session.user.email}</span>
          <button
            type="button"
            onClick={() => void signOut()}
            class="rounded-lg border border-white/10 px-3 py-1.5 text-sm hover:bg-white/10"
          >
            Выйти
          </button>
        </div>
      </div>
    </header>
  );
}

function Nav(): JSX.Element {
  const loc = useLocation();
  return (
    <nav class="flex items-center gap-1">
      {navItems.map((k: RouteKey) => {
        const r = routes[k];
        const isActive =
          r.path === '/' ? loc.path === '/' : loc.path === r.path || loc.path.startsWith(r.path + '/');
        return (
          <a
            key={k}
            href={r.path}
            onClick={(e) => {
              e.preventDefault();
              loc.route(r.path);
            }}
            class={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            {r.label}
          </a>
        );
      })}
    </nav>
  );
}

function SyncBadge({ status }: { status: SyncStatus }): JSX.Element {
  const color = !status.online
    ? 'bg-amber-500/20 text-amber-300'
    : status.pending > 0
      ? 'bg-blue-500/20 text-blue-300'
      : 'bg-emerald-500/20 text-emerald-300';
  const label = !status.online
    ? 'Офлайн'
    : status.pending > 0
      ? `Синхронизация… ${status.pending}`
      : 'Синхронизировано';
  return (
    <span
      class={`rounded-full px-2.5 py-0.5 text-xs ${color}`}
      title={status.lastError ?? undefined}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------
// Экраны-заглушки
// ---------------------------------------------------------------

function NotFoundScreen(): JSX.Element {
  return <Placeholder title="404" description="Такой страницы нет." />;
}
