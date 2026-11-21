import { navigationAbsolutePath } from '../../src/pages/HomePage/utils/path';
import { generatePreviewPath } from '../../src/pages/HomePage/components/NavigationItemForm/utils/properties';

jest.mock('../../src/pages/HomePage/utils', () => ({
  extractRelatedItemLabel: jest.fn(),
}));

describe('navigationAbsolutePath', () => {
  it('joins a real segment onto the parent path', () => {
    expect(navigationAbsolutePath('/news', 'test', false)).toBe('/news/test');
    expect(navigationAbsolutePath('/', 'test', false)).toBe('/test');
    expect(navigationAbsolutePath('', 'test', false)).toBe('/test');
  });

  it('inherits the parent path when the item has no segment', () => {
    expect(navigationAbsolutePath('/news', null, false)).toBe('/news');
    expect(navigationAbsolutePath('/news', '', false)).toBe('/news');
    expect(navigationAbsolutePath('/news', 'null', false)).toBe('/news');
    expect(navigationAbsolutePath('/', null, false)).toBe('');
  });

  it('uses a manual path as is', () => {
    expect(navigationAbsolutePath('/news', 'custom', true)).toBe('custom');
  });
});

describe('generatePreviewPath', () => {
  it('previews the path under the parent level', () => {
    expect(
      generatePreviewPath({
        currentPath: 'test',
        current: { levelPath: '/news' },
      })
    ).toBe('/news/test');
  });

  it('previews the inherited level when there is no segment and no default', () => {
    expect(
      generatePreviewPath({
        currentPath: '/',
        current: { levelPath: '/' },
        currentType: 'WRAPPER',
      })
    ).toBe('');
  });
});
