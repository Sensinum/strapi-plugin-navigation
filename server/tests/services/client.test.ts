import { Core } from '@strapi/strapi';

import { getNavigationItemRepository, getNavigationRepository } from '../../src/repositories';
import clientService from '../../src/services/client/client';
import { getPluginService } from '../../src/utils';
import { asProxy } from '../utils';

jest.mock('../../src/repositories');
jest.mock('../../src/utils');

const navItem = (overrides: Record<string, unknown>) => ({
  id: 0,
  documentId: '',
  title: '',
  type: 'INTERNAL',
  path: null,
  isManualPath: false,
  uiRouterKey: '',
  menuAttached: true,
  order: 1,
  collapsed: false,
  audience: [],
  additionalFields: {},
  related: null,
  parent: null,
  items: [],
  ...overrides,
});

const parent = (documentId: string) => ({ id: 0, documentId });

const services = {
  admin: {
    config: jest.fn().mockResolvedValue({
      contentTypes: [],
      contentTypesNameFields: {},
      additionalFields: [],
    }),
  },
  common: {
    mapToNavigationItemDTO: jest
      .fn()
      .mockImplementation(async ({ navigationItems }) => navigationItems),
    getSlug: jest.fn().mockResolvedValue('slug'),
  },
};

const renderNavigation = (items: any[], args: Record<string, unknown> = {}) => {
  (getNavigationRepository as jest.Mock).mockReturnValue({
    find: jest
      .fn()
      .mockResolvedValue([{ id: 1, documentId: 'nav', slug: 'main', locale: 'en', visible: true }]),
  });
  (getNavigationItemRepository as jest.Mock).mockReturnValue({
    find: jest.fn().mockResolvedValue(items),
  });
  (getPluginService as jest.Mock).mockImplementation(
    (_, name: keyof typeof services) => services[name]
  );

  const service = clientService({ strapi: asProxy<Core.Strapi>({}) });

  return service.render({ idOrSlug: 'nav', ...args } as any);
};

const navigationItems = () => [
  navItem({ id: 1, documentId: 'news', title: 'News', path: 'news', order: 1 }),
  navItem({
    id: 2,
    documentId: 'test',
    title: 'Test',
    path: 'test',
    order: 2,
    parent: parent('news'),
  }),
  navItem({
    id: 3,
    documentId: 'deep',
    title: 'Deep',
    path: 'deep',
    order: 3,
    parent: parent('test'),
  }),
  navItem({
    id: 4,
    documentId: 'testing',
    title: 'Testing',
    path: 'testing',
    order: 4,
    parent: parent('news'),
  }),
];

describe('Client service render()', () => {
  describe('without rootPath', () => {
    it('returns every item in FLAT with its absolutePath', async () => {
      const result = (await renderNavigation(navigationItems(), { type: 'FLAT' })) as any[];

      expect(result.map(({ id }) => id).sort()).toEqual([1, 2, 3, 4]);
      expect(result.find(({ id }) => id === 3)).toEqual(
        expect.objectContaining({ path: 'deep', absolutePath: '/news/test/deep' })
      );
    });
  });

  describe('with rootPath', () => {
    it('FLAT returns the exact match and its descendants only', async () => {
      const result = (await renderNavigation(navigationItems(), {
        type: 'FLAT',
        rootPath: '/news/test',
      })) as any[];

      expect(result.map(({ id }) => id).sort()).toEqual([2, 3]);
    });

    it('TREE returns the exact match with its children', async () => {
      const result = (await renderNavigation(navigationItems(), {
        type: 'TREE',
        rootPath: '/news/test',
      })) as any[];

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({ id: 2, path: '/news/test' }));
      expect(result[0].items).toEqual([
        expect.objectContaining({ id: 3, path: '/news/test/deep' }),
      ]);
    });

    it('RFR returns pages for the exact match and its descendants only', async () => {
      const result = (await renderNavigation(navigationItems(), {
        type: 'RFR',
        rootPath: '/news/test',
      })) as any;

      expect(Object.keys(result.pages).sort()).toEqual(['deep', 'test']);
    });

    it.each([
      ['null', null],
      ['empty string', ''],
    ])(
      'matches a child of a parent with a %s path the same way in every render type',
      async (_, parentPath) => {
        const items = () => [
          navItem({ id: 1, documentId: 'parent', title: 'Parent', path: parentPath, order: 1 }),
          navItem({
            id: 2,
            documentId: 'child',
            title: 'Child',
            path: 'test',
            order: 2,
            parent: parent('parent'),
          }),
        ];

        const flat = (await renderNavigation(items(), {
          type: 'FLAT',
          rootPath: '/test',
        })) as any[];
        const tree = (await renderNavigation(items(), {
          type: 'TREE',
          rootPath: '/test',
        })) as any[];
        const rfr = (await renderNavigation(items(), {
          type: 'RFR',
          rootPath: '/test',
        })) as any;

        expect(flat.map(({ id }) => id)).toEqual([2]);
        expect(flat[0].path).toBe('test');
        expect(flat[0].absolutePath).toBe('/test');
        expect(tree.map(({ id }) => id)).toEqual([2]);
        expect(tree[0].path).toBe('/test');
        expect(Object.keys(rfr.pages)).toEqual(['child']);
      }
    );

    it('does not match the reserved null spelling of a missing segment', async () => {
      const items = () => [
        navItem({ id: 1, documentId: 'parent', title: 'Parent', path: null, order: 1 }),
        navItem({
          id: 2,
          documentId: 'child',
          title: 'Child',
          path: 'test',
          order: 2,
          parent: parent('parent'),
        }),
      ];

      const flat = (await renderNavigation(items(), {
        type: 'FLAT',
        rootPath: '/null/test',
      })) as any[];
      const tree = (await renderNavigation(items(), {
        type: 'TREE',
        rootPath: '/null/test',
      })) as any[];

      expect(flat).toEqual([]);
      expect(tree).toEqual([]);
    });
  });
});
