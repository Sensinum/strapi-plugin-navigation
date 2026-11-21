import { DynamicSchemas } from '../../src/schemas';
import { NavigationItemDTO } from '../../src/dtos';
import { buildNestedPaths, filterByPath } from '../../src/services/client/utils';
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

  it('treats an empty string the same as a missing segment', () => {
    expect(pathSegmentAbsent(null)).toBe(true);
    expect(pathSegmentAbsent(undefined)).toBe(true);
    expect(pathSegmentAbsent('null')).toBe(true);
    expect(pathSegmentAbsent('')).toBe(true);
    expect(pathSegmentAbsent('/news')).toBe(false);
  });

  it('skips a missing segment and joins a real segment onto the ancestor', () => {
    expect(composeNavigationPath('', null, false)).toBeNull();
    expect(composeNavigationPath('', '', false)).toBeNull();
    expect(composeNavigationPath('/news', 'null', false)).toBeNull();
    expect(composeNavigationPath(undefined, 'test', false)).toBe('/test');
    expect(composeNavigationPath('/news', 'test', false)).toBe('/news/test');
    expect(composeNavigationPath('/news', '/test', false)).toBe('/news/test');
    expect(composeNavigationPath('/', 'test', false)).toBe('/test');
    expect(composeNavigationPath('/news', 'custom', true)).toBe('custom');
  });

  it('renders absent segments as json null and keeps real paths', () => {
    expect(renderedItemPath('null')).toBeNull();
    expect(renderedItemPath(null)).toBeNull();
    expect(renderedItemPath('')).toBeNull();
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
});

describe('nested paths', () => {
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
        expect.objectContaining({ documentId: 'root', path: '', absolutePath: null }),
        expect.objectContaining({ documentId: 'child', path: '/test', absolutePath: '/test' }),
      ])
    );
  });

  it('keeps the parent link when the parent has no segment', () => {
    const nested = buildNestedPaths([
      { documentId: 'root', path: null, parent: null },
      {
        documentId: 'child',
        path: 'test',
        parent: asProxy<NavigationItemDTO>({ documentId: 'root' }),
      },
    ]);

    expect(nested.find(({ documentId }) => documentId === 'child')?.parent).toEqual(
      expect.objectContaining({ documentId: 'root' })
    );
  });

  it('uses the manual path as the full path', () => {
    const nested = buildNestedPaths([
      { documentId: 'news', path: 'news', parent: null },
      {
        documentId: 'custom',
        path: 'custom',
        isManualPath: true,
        parent: asProxy<NavigationItemDTO>({ documentId: 'news' }),
      },
    ]);

    expect(nested.find(({ documentId }) => documentId === 'custom')?.absolutePath).toBe('custom');
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

describe('filterByPath', () => {
  const parentOf = (documentId: string) =>
    asProxy<NavigationItemDTO>({ documentId, id: 1, order: 1 });

  const tree = () => [
    { documentId: 'news', path: 'news', order: 1, parent: null },
    { documentId: 'test', path: 'test', order: 2, parent: parentOf('news') },
    { documentId: 'deep', path: 'deep', order: 3, parent: parentOf('test') },
    { documentId: 'testing', path: 'testing', order: 4, parent: parentOf('news') },
    { documentId: 'top-test', path: 'test', order: 5, parent: null },
    { documentId: 'nulled', path: null, order: 6, parent: parentOf('news') },
    { documentId: 'under-null', path: 'x', order: 7, parent: parentOf('nulled') },
  ];

  it('returns the exact match and its structural descendants only', () => {
    const { root, items } = filterByPath(tree(), '/news/test');

    expect(root?.documentId).toBe('test');
    expect(items.map(({ documentId }) => documentId).sort()).toEqual(['deep', 'test']);
  });

  it('does not match sibling items that only share a prefix', () => {
    const { items } = filterByPath(tree(), '/news/test');

    expect(items.map(({ documentId }) => documentId)).not.toContain('testing');
  });

  it('returns nothing when no item has that full path', () => {
    expect(filterByPath(tree(), '/missing')).toEqual({ root: undefined, items: [] });
  });

  it('does not match an item without its own segment by its inherited path', () => {
    expect(filterByPath(tree(), '/news').root?.documentId).toBe('news');
    expect(filterByPath(tree(), '/news/nulled').root).toBeUndefined();
  });

  it('reaches an item through a parent that has no segment of its own', () => {
    const { root, items } = filterByPath(tree(), '/news/x');

    expect(root?.documentId).toBe('under-null');
    expect(items.map(({ documentId }) => documentId)).toEqual(['under-null']);
  });

  it('picks the first duplicate in render order', () => {
    const withManual = [
      ...tree(),
      { documentId: 'manual-test', path: '/test', isManualPath: true, order: 0, parent: null },
    ];

    expect(filterByPath(withManual, '/test').root?.documentId).toBe('manual-test');
    expect(filterByPath(tree(), '/test').root?.documentId).toBe('top-test');
  });
});
