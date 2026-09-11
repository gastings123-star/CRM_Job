import { describe, expect, it } from 'vitest';
import { sameRoutePath } from '@/app/routes';

describe('route path comparison', () => {
  it('treats the GitHub Pages base with and without a trailing slash as the same route', () => {
    expect(sameRoutePath('/CRM_Job', '/CRM_Job/')).toBe(true);
  });

  it('does not merge different routes', () => {
    expect(sameRoutePath('/CRM_Job', '/CRM_Job/overview')).toBe(false);
  });
});
