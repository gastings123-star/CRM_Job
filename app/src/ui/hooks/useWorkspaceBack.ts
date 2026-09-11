import { useLayoutEffect, useRef } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { routes } from '@/app/routes';
export function workspaceParent(path: string) {
  if (path === routes.dashboard.path) return routes.dashboard.path;
  if (path.startsWith(routes.crm.path + '/')) return routes.crm.path;
  if (path.startsWith(routes.teams.path + '/')) return routes.teams.path;
  return path === routes.overview.path ? routes.dashboard.path : routes.overview.path;
}
export function useWorkspaceBack() {
  const loc = useLocation();
  const trail = useRef<{ url: string; scroll: number }[]>([]);
  const restoring = useRef(false);
  useLayoutEffect(() => {
    const entries = trail.current;
    if (entries.at(-1)?.url !== loc.url) entries.push({ url: loc.url, scroll: 0 });
    const entry = entries.at(-1)!;
    const restore = restoring.current;
    restoring.current = false;
    const frame = requestAnimationFrame(() => window.scrollTo(0, restore ? entry.scroll : 0));
    const remember = () => {
      entry.scroll = window.scrollY;
    };
    window.addEventListener('scroll', remember, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', remember);
    };
  }, [loc.url]);
  return () => {
    if (trail.current.length > 1) {
      trail.current.pop();
      restoring.current = true;
      loc.route(trail.current.at(-1)!.url);
    } else loc.route(workspaceParent(loc.path));
  };
}
