import { shouldBlockNavigationLeave } from '../../src/pages/HomePage/utils/shouldBlockNavigationLeave';

const here = { pathname: '/plugins/navigation', search: '' };

describe('shouldBlockNavigationLeave', () => {
  it('blocks a different path when there are unsaved changes', () => {
    expect(
      shouldBlockNavigationLeave(true, here, {
        pathname: '/content-manager/collection-types/api::page.page',
        search: '',
      })
    ).toBe(true);
  });

  it('blocks a search change when there are unsaved changes', () => {
    expect(
      shouldBlockNavigationLeave(true, here, { pathname: here.pathname, search: '?page=2' })
    ).toBe(true);
  });

  it('allows staying on the same path and search', () => {
    expect(shouldBlockNavigationLeave(true, here, here)).toBe(false);
  });

  it('allows navigation when there are no unsaved changes', () => {
    expect(
      shouldBlockNavigationLeave(false, here, {
        pathname: '/content-manager',
        search: '',
      })
    ).toBe(false);
  });
});
