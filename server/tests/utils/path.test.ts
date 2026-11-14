import { DynamicSchemas } from '../../src/schemas';
import { NavigationItemDTO } from '../../src/dtos';
import { buildNestedPaths } from '../../src/services/client/utils';
import {
  composeNavigationPath,
  pathReserved,
  pathSegmentAbsent,
  renderedItemPath,
} from '../../src/utils/path';
import { asProxy } from '../utils';

describe('path segments', () => {
  it('reserves only the exact string null', () => {
    expect(pathReserved('null')).toBe(true);
    expect(pathReserved(null)).toBe(false);
    expect(pathReserved(undefined)).toBe(false);
    expect(pathReserved('')).toBe(false);
    expect(pathReserved('NULL')).toBe(false);
    expect(pathReserved(' null ')).toBe(false);
    expect(pathReserved('/null')).toBe(false);
  });

  it('keeps an empty string distinct from a missing segment', () => {
    expect(pathSegmentAbsent(null)).toBe(true);
    expect(pathSegmentAbsent(undefined)).toBe(true);
    expect(pathSegmentAbsent('null')).toBe(true);
    expect(pathSegmentAbsent('')).toBe(false);
    expect(pathSegmentAbsent('/news')).toBe(false);
  });

  it('skips a missing segment and joins a real segment onto the ancestor', () => {
    expect(composeNavigationPath('', null, false)).toBeNull();
    expect(composeNavigationPath('/news', 'null', false)).toBeNull();
    expect(composeNavigationPath(undefined, 'test', false)).toBe('/test');
    expect(composeNavigationPath('/news', 'test', false)).toBe('/news/test');
    expect(composeNavigationPath('/news', '/test', false)).toBe('/news/test');
    expect(composeNavigationPath('/', 'test', false)).toBe('/test');
    expect(composeNavigationPath('/news', 'custom', true)).toBe('custom');
    expect(composeNavigationPath('/news', '', false)).toBe('/news/');
  });

  it('renders the reserved string as json null', () => {
    expect(renderedItemPath('null')).toBeNull();
    expect(renderedItemPath(null)).toBeNull();
    expect(renderedItemPath('')).toBe('');
    expect(renderedItemPath('/news')).toBe('/news');
  });

  it('rejects a reserved path on navigation update and accepts json null', () => {
    const item = {
      title: 'Home',
      type: 'INTERNAL' as const,
      uiRouterKey: 'home',
      menuAttached: false,
      order: 1,
      collapsed: false,
    };

    const reserved = DynamicSchemas.updateNavigationSchema.safeParse({
      id: 1,
      documentId: 'doc',
      items: [{ ...item, path: 'null' }],
    });
    const missing = DynamicSchemas.updateNavigationSchema.safeParse({
      id: 1,
      documentId: 'doc',
      items: [{ ...item, path: null }],
    });

    expect(reserved.success).toBe(false);
    expect(missing.success).toBe(true);
  });

  it('omits a null parent segment when nesting paths', () => {
    const nested = buildNestedPaths([
      { documentId: 'root', path: null, parent: null },
      {
        documentId: 'child',
        path: 'test',
        parent: asProxy<NavigationItemDTO>({ documentId: 'root' }),
      },
    ]);

    expect(nested).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ documentId: 'root', path: '' }),
        expect.objectContaining({ documentId: 'child', path: '/test' }),
      ])
    );
  });

  it('stops when a parent cycle is deeper than the item count', () => {
    const repeated = {
      documentId: 'a',
      path: 'a',
      parent: asProxy<NavigationItemDTO>({ documentId: 'a' }),
    };

    expect(() =>
      buildNestedPaths([{ documentId: 'a', path: 'a', parent: null }, repeated])
    ).toThrow('Navigation path walk exceeded 2 items');
  });
});
