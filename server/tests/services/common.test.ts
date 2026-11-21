import { faker } from '@faker-js/faker';
import { Core } from '@strapi/strapi';

import { CreateBranchNavigationItemDTO } from '../../src/dtos';
import { getGenericRepository, getNavigationItemRepository } from '../../src/repositories';
import { NavigationDBSchema, NavigationItemDBSchema } from '../../src/schemas';
import commonService from '../../src/services/common/common';
import { GetBranchNameInput } from '../../src/services/common/types';
import { checkDuplicatePath, generateFieldsFromRelated } from '../../src/services/common/utils';
import { LifeCycleEvent } from '../../src/types';
import { getPluginService } from '../../src/utils';
import { asProxy } from '../utils';

jest.mock('../../src/repositories');
jest.mock('../../src/utils');
jest.mock('@sindresorhus/slugify', () => ({
  __esModule: true,
  default: (s: string) => s.toLowerCase().replace(/\s+/g, '-'),
}));
jest.mock('@strapi/utils', () => ({
  sanitize: {
    sanitizers: {
      defaultSanitizeOutput: jest.fn().mockResolvedValue({}),
    },
  },
}));
jest.mock('../../src/config', () => ({
  configSetup: jest.fn().mockResolvedValue({ contentTypes: [] }),
}));

const makeItem = (overrides: Partial<NavigationItemDBSchema> = {}): NavigationItemDBSchema =>
  asProxy<NavigationItemDBSchema>({
    id: faker.number.int(),
    documentId: faker.string.uuid(),
    title: faker.lorem.word(),
    type: 'INTERNAL',
    path: `/${faker.lorem.slug()}`,
    uiRouterKey: faker.lorem.slug(),
    menuAttached: false,
    order: 1,
    collapsed: false,
    additionalFields: {},
    audience: [],
    items: [],
    ...overrides,
  });

const getMasterEntity = (): NavigationDBSchema =>
  asProxy<NavigationDBSchema>({
    id: faker.number.int(),
    documentId: faker.string.uuid(),
    locale: 'en',
  });

const getNewNavigationItem = (
  overrides: Partial<CreateBranchNavigationItemDTO> = {}
): CreateBranchNavigationItemDTO =>
  asProxy<CreateBranchNavigationItemDTO>({
    title: 'User Title',
    path: '/user-path',
    type: 'INTERNAL',
    autoSync: false,
    uiRouterKey: 'user-title',
    order: 1,
    collapsed: false,
    menuAttached: false,
    additionalFields: {},
    audience: [],
    items: [],
    related: {
      __type: 'api::article.article',
      documentId: faker.string.uuid(),
    },
    ...overrides,
  });

describe('CommonService', () => {
  const strapi = asProxy<Core.Strapi>({});

  describe('getBranchName()', () => {
    const service = commonService({ strapi });

    it('should return "toUpdate" when item has documentId and is not removed', () => {
      const result = service.getBranchName({
        item: asProxy<GetBranchNameInput['item']>({
          documentId: faker.string.uuid(),
          removed: false,
        }),
      });

      expect(result).toBe('toUpdate');
    });

    it('should return "toRemove" when item has documentId and is removed', () => {
      const result = service.getBranchName({
        item: asProxy<GetBranchNameInput['item']>({
          documentId: faker.string.uuid(),
          removed: true,
        }),
      });

      expect(result).toBe('toRemove');
    });

    it('should return "toCreate" when item has no documentId and is not removed', () => {
      const result = service.getBranchName({
        item: asProxy<GetBranchNameInput['item']>({ documentId: undefined, removed: false }),
      });

      expect(result).toBe('toCreate');
    });

    it('should return undefined when item has no documentId and is removed', () => {
      const result = service.getBranchName({
        item: asProxy<GetBranchNameInput['item']>({ documentId: undefined, removed: true }),
      });

      expect(result).toBeUndefined();
    });
  });

  describe('buildNestedStructure()', () => {
    const service = commonService({ strapi });

    it('should return empty array when navigationItems is undefined', () => {
      const result = service.buildNestedStructure({ navigationItems: undefined });

      expect(result).toEqual([]);
    });

    it('should return all items as root when no id filter is provided', () => {
      const items = [makeItem({ parent: undefined }), makeItem({ parent: undefined })];

      const result = service.buildNestedStructure({ navigationItems: items });

      expect(result).toHaveLength(2);
    });

    it('should filter to children of the given id', () => {
      const parentId = 100;
      const child = makeItem({ parent: { id: parentId } as NavigationItemDBSchema, items: [] });
      const other = makeItem({ parent: { id: 999 } as NavigationItemDBSchema, items: [] });

      const result = service.buildNestedStructure({
        navigationItems: [child, other],
        id: parentId,
      });

      expect(result).toHaveLength(1);
      expect(result[0].documentId).toBe(child.documentId);
    });

    it('should recursively populate items on each navigation item', () => {
      const root = makeItem({ parent: undefined, items: [] });
      const child = makeItem({ parent: { id: root.id } as NavigationItemDBSchema, items: [] });
      const grandchild = makeItem({
        parent: { id: child.id } as NavigationItemDBSchema,
        items: [],
      });

      const result = service.buildNestedStructure({
        navigationItems: [root, child, grandchild],
      });

      const rootResult = result.find((item) => item.documentId === root.documentId);

      expect(rootResult).toBeDefined();
      expect(rootResult?.items).toHaveLength(1);
      expect(rootResult?.items?.[0].items).toHaveLength(1);
    });
  });

  describe('createBranch()', () => {
    const mockSave = jest.fn();
    const mockAdminConfig = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();

      (getNavigationItemRepository as jest.Mock).mockReturnValue({ save: mockSave });

      (getPluginService as jest.Mock).mockReturnValue({
        config: mockAdminConfig,
      });

      mockAdminConfig.mockResolvedValue({
        contentTypesNameFields: { default: ['title', 'name'] },
        pathDefaultFields: {},
      });

      mockSave.mockImplementation(({ item }) =>
        Promise.resolve({ ...item, id: faker.number.int(), documentId: faker.string.uuid() })
      );
    });

    it('should preserve user-provided title and path when autoSync is false', async () => {
      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();
      const item = getNewNavigationItem({ autoSync: false });

      await service.createBranch({
        action: {},
        masterEntity,
        navigationItems: [item],
        parentItem: undefined,
      });

      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({ title: 'User Title', path: '/user-path' }),
        })
      );
    });

    it('should reject a reserved path before saving', async () => {
      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();
      const item = getNewNavigationItem({ path: 'null', title: 'Missing' });

      await expect(
        service.createBranch({
          action: {},
          masterEntity,
          navigationItems: [item],
          parentItem: undefined,
        })
      ).rejects.toThrow('Path "null" is reserved for Missing');

      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should stop a cyclic branch at the depth cap', async () => {
      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();
      const item: CreateBranchNavigationItemDTO = {
        title: 'Loop',
        path: '/ok',
        type: 'INTERNAL',
        autoSync: false,
        uiRouterKey: 'loop',
        order: 1,
        collapsed: false,
        menuAttached: false,
        additionalFields: {},
        audience: [],
        items: [],
      };
      item.items = [item];

      await expect(
        service.createBranch({
          action: {},
          masterEntity,
          navigationItems: [item],
          parentItem: undefined,
          depthMax: 1,
        })
      ).rejects.toThrow('Navigation item walk exceeded 1 items');
    });

    it('should preserve user-provided title and path when autoSync is true and values are provided', async () => {
      const mockFindById = jest.fn().mockResolvedValue({
        id: 1,
        title: 'Auto Title from Related',
        name: 'auto-path',
      });
      (getGenericRepository as jest.Mock).mockReturnValue({ findById: mockFindById });

      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();
      const item = getNewNavigationItem({
        autoSync: true,
        title: 'User Title',
        path: '/user-path',
      });

      await service.createBranch({
        action: {},
        masterEntity,
        navigationItems: [item],
        parentItem: undefined,
      });

      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({ title: 'User Title', path: '/user-path' }),
        })
      );
    });

    it('should use generated title and path when autoSync is true and values are empty', async () => {
      const mockFindById = jest
        .fn()
        .mockResolvedValue({ id: 42, title: 'Auto Title from Related' });
      (getGenericRepository as jest.Mock).mockReturnValue({ findById: mockFindById });

      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();
      const item = getNewNavigationItem({ autoSync: true, title: '', path: '' });

      await service.createBranch({
        action: {},
        masterEntity,
        navigationItems: [item],
        parentItem: undefined,
      });

      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({ title: 'Auto Title from Related', path: '42' }),
        })
      );
    });

    it('should not call generateFieldsFromRelated when autoSync is false', async () => {
      const mockFindById = jest.fn();
      (getGenericRepository as jest.Mock).mockReturnValue({ findById: mockFindById });

      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();
      const item = getNewNavigationItem({ autoSync: false });

      await service.createBranch({
        action: {},
        masterEntity,
        navigationItems: [item],
        parentItem: undefined,
      });

      expect(mockFindById).not.toHaveBeenCalled();
    });

    it('should use generated values as fallback when autoSync is true and title/path are undefined', async () => {
      const mockFindById = jest.fn().mockResolvedValue({ id: 7, title: 'Generated Title' });
      (getGenericRepository as jest.Mock).mockReturnValue({ findById: mockFindById });

      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();
      const item = getNewNavigationItem({
        autoSync: true,
        title: undefined,
        path: undefined,
      });

      await service.createBranch({
        action: {},
        masterEntity,
        navigationItems: [item],
        parentItem: undefined,
      });

      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({ title: 'Generated Title', path: '7' }),
        })
      );
    });

    it('should use documentId and id branch when both are present on the item', async () => {
      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();
      const existingDocumentId = faker.string.uuid();
      const existingId = faker.number.int();
      const item = getNewNavigationItem({
        documentId: existingDocumentId,
        id: existingId,
        autoSync: false,
      });

      await service.createBranch({
        action: {},
        masterEntity,
        navigationItems: [item],
        parentItem: undefined,
      });

      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({ documentId: existingDocumentId, id: existingId }),
        })
      );
    });

    it('should recursively create child items and set parentItem correctly', async () => {
      const parentDocumentId = faker.string.uuid();
      const parentId = faker.number.int();

      // First save returns the parent, second returns the child
      mockSave
        .mockResolvedValueOnce({ id: parentId, documentId: parentDocumentId })
        .mockResolvedValueOnce({ id: faker.number.int(), documentId: faker.string.uuid() });

      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();

      const childItem = getNewNavigationItem({ title: 'Child', path: '/child' });
      const parentItem = getNewNavigationItem({
        title: 'Parent',
        path: '/parent',
        items: [childItem],
      });

      await service.createBranch({
        action: {},
        masterEntity,
        navigationItems: [parentItem],
        parentItem: undefined,
      });

      expect(mockSave).toHaveBeenCalledTimes(2);
      // Child save should reference the parent's id
      expect(mockSave).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          item: expect.objectContaining({ parent: parentId }),
        })
      );
    });
  });

  describe('removeBranch()', () => {
    const mockRemove = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
      (getNavigationItemRepository as jest.Mock).mockReturnValue({ remove: mockRemove });
      mockRemove.mockResolvedValue(undefined);
    });

    it('should return empty array for empty input', async () => {
      const service = commonService({ strapi });

      const result = await service.removeBranch({ navigationItems: [] });

      expect(result).toEqual([]);
      expect(mockRemove).not.toHaveBeenCalled();
    });

    it('should remove item with documentId and return action', async () => {
      const service = commonService({ strapi });
      const item = makeItem();

      const result = await service.removeBranch({ navigationItems: [item] });

      expect(mockRemove).toHaveBeenCalledWith(item);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ remove: true });
    });

    it('should skip items without documentId', async () => {
      const service = commonService({ strapi });
      const itemWithoutId = makeItem({ documentId: undefined });

      const result = await service.removeBranch({ navigationItems: [itemWithoutId] });

      expect(mockRemove).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should recursively remove nested child items', async () => {
      const service = commonService({ strapi });
      const child = makeItem();
      const parent = makeItem({ items: [child] });

      const result = await service.removeBranch({ navigationItems: [parent] });

      expect(mockRemove).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });
  });

  describe('updateBranch()', () => {
    const mockSave = jest.fn();
    const mockAdminConfig = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();

      (getNavigationItemRepository as jest.Mock).mockReturnValue({ save: mockSave });

      (getPluginService as jest.Mock).mockReturnValue({
        config: mockAdminConfig,
      });

      mockAdminConfig.mockResolvedValue({
        contentTypesNameFields: { default: ['title', 'name'] },
        pathDefaultFields: {},
      });

      mockSave.mockImplementation(({ item }) =>
        Promise.resolve({ ...item, id: faker.number.int(), documentId: faker.string.uuid() })
      );
    });

    it('should save item when updated is true', async () => {
      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();
      const item = makeItem();

      await service.updateBranch({
        action: {},
        masterEntity,
        navigationItems: [{ ...item, updated: true }],
        parentItem: undefined,
      });

      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({ documentId: item.documentId }),
        })
      );
    });

    it('should reject a reserved path before updating', async () => {
      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();
      const item = makeItem({ path: 'null', title: 'Missing' });

      await expect(
        service.updateBranch({
          action: {},
          masterEntity,
          navigationItems: [{ ...item, updated: true }],
          parentItem: undefined,
        })
      ).rejects.toThrow('Path "null" is reserved for Missing');

      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should skip save when updated is false', async () => {
      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();
      const item = makeItem();

      await service.updateBranch({
        action: {},
        masterEntity,
        navigationItems: [{ ...item, updated: false }],
        parentItem: undefined,
      });

      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should return action when item has no children', async () => {
      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();
      const item = makeItem();

      const result = await service.updateBranch({
        action: {},
        masterEntity,
        navigationItems: [{ ...item, updated: false, items: [] }],
        parentItem: undefined,
      });

      expect(result).toHaveLength(1);
    });

    it('should recursively analyze children via analyzeBranch', async () => {
      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();

      const childItem = getNewNavigationItem({
        documentId: undefined,
        id: undefined,
        title: 'Child',
        path: '/child',
        autoSync: false,
      });

      const parentItem = makeItem();

      await service.updateBranch({
        action: {},
        masterEntity,
        navigationItems: [
          {
            ...parentItem,
            updated: false,
            items: [childItem as unknown as NavigationItemDBSchema],
          },
        ],
        parentItem: undefined,
      });

      expect(mockSave).toHaveBeenCalled();
    });
  });

  describe('analyzeBranch()', () => {
    const mockSave = jest.fn();
    const mockRemove = jest.fn();
    const mockAdminConfig = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();

      (getNavigationItemRepository as jest.Mock).mockReturnValue({
        save: mockSave,
        remove: mockRemove,
      });

      (getPluginService as jest.Mock).mockReturnValue({ config: mockAdminConfig });

      mockAdminConfig.mockResolvedValue({
        contentTypesNameFields: { default: ['title', 'name'] },
        pathDefaultFields: {},
      });

      mockSave.mockImplementation(({ item }) =>
        Promise.resolve({ ...item, id: faker.number.int(), documentId: faker.string.uuid() })
      );
      mockRemove.mockResolvedValue(undefined);
    });

    it('should handle empty navigationItems array', async () => {
      const service = commonService({ strapi });

      const result = await service.analyzeBranch({
        navigationItems: [],
        masterEntity: getMasterEntity(),
        prevAction: {},
      });

      expect(result).toEqual([]);
      expect(mockSave).not.toHaveBeenCalled();
      expect(mockRemove).not.toHaveBeenCalled();
    });

    it('should categorize items and call create, remove and update branches', async () => {
      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();

      const toCreate = getNewNavigationItem({ documentId: undefined, id: undefined });
      const toRemove = { ...makeItem(), removed: true };
      const toUpdate = { ...makeItem(), removed: false };

      await service.analyzeBranch({
        navigationItems: [toCreate, toRemove, toUpdate] as unknown as NavigationItemDBSchema[],
        masterEntity,
        prevAction: {},
      });

      expect(mockSave).toHaveBeenCalled();
      expect(mockRemove).toHaveBeenCalledWith(toRemove);
    });

    it('should propagate prevAction flags', async () => {
      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();

      const result = await service.analyzeBranch({
        navigationItems: [],
        masterEntity,
        prevAction: { create: true, update: true },
      });

      expect(result).toEqual([]);
    });

    it('should reject when duplicate INTERNAL paths exist under parent', async () => {
      const service = commonService({ strapi });
      const masterEntity = getMasterEntity();

      const sharedPath = '/dup';
      const existingChild = makeItem({ path: sharedPath, id: 5 });
      const parentItem = makeItem({ items: [existingChild] });

      const newItem = getNewNavigationItem({
        documentId: undefined,
        id: undefined,
        path: sharedPath,
        type: 'INTERNAL',
      });

      await expect(
        service.analyzeBranch({
          navigationItems: [newItem] as any,
          masterEntity,
          parentItem: parentItem as any,
          prevAction: {},
        })
      ).rejects.toMatchObject({ type: 'NavigationError' });
    });
  });

  describe('getSlug()', () => {
    const mockCount = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
      (getNavigationItemRepository as jest.Mock).mockReturnValue({ count: mockCount });
    });

    it('should append count suffix when slug already exists', async () => {
      mockCount.mockResolvedValue(3);

      const service = commonService({ strapi });
      const result = await service.getSlug({ query: 'existing slug' });

      expect(result).toBe('existing-slug-3');
    });
  });

  describe('utils', () => {
    describe('checkDuplicatePath()', () => {
      it('should resolve when parentItem is undefined', async () => {
        await expect(
          checkDuplicatePath({
            checkData: [{ title: 'A', path: '/a', type: 'INTERNAL', id: 1 }],
            parentItem: undefined,
          })
        ).resolves.toBeUndefined();
      });

      it('should resolve when parentItem has no items', async () => {
        await expect(
          checkDuplicatePath({
            checkData: [{ title: 'A', path: '/a', type: 'INTERNAL', id: 1 }],
            parentItem: { title: 'Parent', type: 'INTERNAL', items: undefined },
          })
        ).resolves.toBeUndefined();
      });

      it('should resolve when no duplicate paths exist', async () => {
        await expect(
          checkDuplicatePath({
            checkData: [{ title: 'New', path: '/new', type: 'INTERNAL', id: 10 }],
            parentItem: {
              title: 'Parent',
              type: 'INTERNAL',
              items: [{ title: 'Existing', path: '/existing', type: 'INTERNAL', id: 5 }],
            },
          })
        ).resolves.toBeUndefined();
      });

      it('should reject with NavigationError when duplicate INTERNAL paths exist', async () => {
        await expect(
          checkDuplicatePath({
            checkData: [{ title: 'New Item', path: '/dup', type: 'INTERNAL', id: 10 }],
            parentItem: {
              title: 'Parent',
              type: 'INTERNAL',
              items: [{ title: 'Existing Item', path: '/dup', type: 'INTERNAL', id: 5 }],
            },
          })
        ).rejects.toMatchObject({ type: 'NavigationError' });
      });

      it('should resolve when duplicate paths exist but items share the same id (editing same item)', async () => {
        await expect(
          checkDuplicatePath({
            checkData: [{ title: 'Same', path: '/dup', type: 'INTERNAL', id: 5 }],
            parentItem: {
              title: 'Parent',
              type: 'INTERNAL',
              items: [{ title: 'Same', path: '/dup', type: 'INTERNAL', id: 5 }],
            },
          })
        ).resolves.toBeUndefined();
      });

      it('should resolve when duplicate paths exist but type is EXTERNAL', async () => {
        await expect(
          checkDuplicatePath({
            checkData: [{ title: 'New', path: '/dup', type: 'EXTERNAL', id: 10 }],
            parentItem: {
              title: 'Parent',
              type: 'INTERNAL',
              items: [{ title: 'Existing', path: '/dup', type: 'INTERNAL', id: 5 }],
            },
          })
        ).resolves.toBeUndefined();
      });

      it('should resolve when duplicate paths exist but existing item is marked removed', async () => {
        await expect(
          checkDuplicatePath({
            checkData: [{ title: 'New', path: '/dup', type: 'INTERNAL', id: 10 }],
            parentItem: {
              title: 'Parent',
              type: 'INTERNAL',
              items: [{ title: 'Removed', path: '/dup', type: 'INTERNAL', id: 5, removed: true }],
            },
          })
        ).resolves.toBeUndefined();
      });
    });

    describe('generateFieldsFromRelated()', () => {
      const mockFindById = jest.fn();

      beforeEach(() => {
        jest.clearAllMocks();
        (getGenericRepository as jest.Mock).mockReturnValue({ findById: mockFindById });
      });

      it('should return undefined for title and path when related is null', async () => {
        const result = await generateFieldsFromRelated(
          { strapi },
          null,
          'en',
          { default: ['title', 'name'] },
          {}
        );

        expect(result).toEqual({ title: undefined, path: undefined });
        expect(getGenericRepository).not.toHaveBeenCalled();
      });

      it('should return undefined for title and path when related is undefined', async () => {
        const result = await generateFieldsFromRelated(
          { strapi },
          undefined,
          'en',
          { default: ['title', 'name'] },
          {}
        );

        expect(result).toEqual({ title: undefined, path: undefined });
        expect(getGenericRepository).not.toHaveBeenCalled();
      });

      it('should derive title from default contentTypesNameFields when no content-type-specific fields are set', async () => {
        const relatedEntity = { id: 42, title: 'My Article', name: 'my-article' };
        mockFindById.mockResolvedValue(relatedEntity);

        const related = { __type: 'api::article.article', documentId: faker.string.uuid() };

        const result = await generateFieldsFromRelated(
          { strapi },
          related,
          'en',
          { default: ['title', 'subject', 'name'] },
          {}
        );

        expect(result.title).toBe('My Article');
      });

      it('should prefer content-type-specific name fields over defaults', async () => {
        const relatedEntity = { id: 42, title: 'ignored', subject: 'My Subject' };
        mockFindById.mockResolvedValue(relatedEntity);

        const related = { __type: 'api::article.article', documentId: faker.string.uuid() };

        const result = await generateFieldsFromRelated(
          { strapi },
          related,
          'en',
          {
            default: ['title'],
            'api::article.article': ['subject'],
          },
          {}
        );

        expect(result.title).toBe('My Subject');
      });

      it('should skip empty fields and use first truthy value for title', async () => {
        const relatedEntity = { id: 42, title: '', subject: '', name: 'Fallback Name' };
        mockFindById.mockResolvedValue(relatedEntity);

        const related = { __type: 'api::article.article', documentId: faker.string.uuid() };

        const result = await generateFieldsFromRelated(
          { strapi },
          related,
          'en',
          { default: ['title', 'subject', 'name'] },
          {}
        );

        expect(result.title).toBe('Fallback Name');
      });

      it('should derive path from pathDefaultFields when configured', async () => {
        const relatedEntity = { id: 42, name: 'My Article', slug: 'my-article' };
        mockFindById.mockResolvedValue(relatedEntity);

        const related = { __type: 'api::article.article', documentId: faker.string.uuid() };

        const result = await generateFieldsFromRelated(
          { strapi },
          related,
          'en',
          { default: ['name'] },
          { 'api::article.article': ['slug'] }
        );

        expect(result.path).toBe('my-article');
      });

      it('should fall back to entity id for path when pathDefaultFields is empty', async () => {
        const relatedEntity = { id: 99, name: 'My Article' };
        mockFindById.mockResolvedValue(relatedEntity);

        const related = { __type: 'api::article.article', documentId: faker.string.uuid() };

        const result = await generateFieldsFromRelated(
          { strapi },
          related,
          'en',
          { default: ['name'] },
          {}
        );

        expect(result.path).toBe('99');
      });

      it('should call repository with correct locale', async () => {
        const relatedEntity = { id: 1, title: 'Article' };
        mockFindById.mockResolvedValue(relatedEntity);

        const related = { __type: 'api::article.article', documentId: 'doc-123' };
        const locale = 'pl';

        await generateFieldsFromRelated({ strapi }, related, locale, { default: ['title'] }, {});

        expect(mockFindById).toHaveBeenCalledWith('doc-123', undefined, 'published', { locale });
      });
    });
  });

  describe('lifecycle hooks', () => {
    let service: ReturnType<typeof commonService>;

    beforeEach(() => {
      jest.clearAllMocks();
      service = commonService({ strapi });
    });

    it('should register a hook and run it', async () => {
      const callback = jest.fn();
      const event = { action: 'afterCreate' } as LifeCycleEvent;

      service.registerLifeCycleHook({
        contentTypeName: 'navigation',
        hookName: 'afterCreate',
        callback,
      });

      await service.runLifeCycleHook({
        contentTypeName: 'navigation',
        hookName: 'afterCreate',
        event,
      });

      expect(callback).toHaveBeenCalledWith(event);
    });

    it('should run all registered listeners for a hook', async () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      const event = { action: 'afterUpdate' } as LifeCycleEvent;

      service.registerLifeCycleHook({
        contentTypeName: 'navigation-item',
        hookName: 'afterUpdate',
        callback: cb1,
      });
      service.registerLifeCycleHook({
        contentTypeName: 'navigation-item',
        hookName: 'afterUpdate',
        callback: cb2,
      });

      await service.runLifeCycleHook({
        contentTypeName: 'navigation-item',
        hookName: 'afterUpdate',
        event,
      });

      expect(cb1).toHaveBeenCalledWith(event);
      expect(cb2).toHaveBeenCalledWith(event);
    });

    it('should handle running a hook with no registered listeners gracefully', async () => {
      await expect(
        service.runLifeCycleHook({
          contentTypeName: 'navigation',
          hookName: 'beforeDelete',
          event: { action: 'beforeDelete' } as LifeCycleEvent,
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('getPluginStore()', () => {
    it('should return the result of strapi.store()', async () => {
      const mockStore = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };
      const mockStoreFn = jest.fn().mockReturnValue(mockStore);

      (global as any).strapi = { store: mockStoreFn };

      const service = commonService({ strapi });
      const result = await service.getPluginStore();

      expect(mockStoreFn).toHaveBeenCalledWith({ type: 'plugin', name: 'navigation' });
      expect(result).toBe(mockStore);
    });
  });

  describe('setDefaultConfig()', () => {
    it('should call configSetup with forceDefault=true and return its result', async () => {
      const { configSetup } = jest.requireMock('../../src/config');

      const service = commonService({ strapi });
      const result = await service.setDefaultConfig();

      expect(configSetup).toHaveBeenCalledWith(expect.objectContaining({ forceDefault: true }));
      expect(result).toEqual({ contentTypes: [] });
    });
  });

  describe('mapToNavigationItemDTO()', () => {
    const mockFindById = jest.fn();

    const validConfig = {
      contentTypes: [],
      contentTypesNameFields: { default: ['title'] },
      contentTypesPopulate: {},
      additionalFields: [],
      pathDefaultFields: {},
      allowedLevels: 2,
      cascadeMenuAttached: true,
      gql: { navigationItemRelated: [] },
      preferCustomContentTypes: false,
      defaultContentType: '',
    };

    beforeEach(() => {
      jest.clearAllMocks();
      (getGenericRepository as jest.Mock).mockReturnValue({ findById: mockFindById });

      const mockStore = {
        get: jest.fn().mockResolvedValue(validConfig),
        set: jest.fn(),
        delete: jest.fn(),
      };
      (global as any).strapi = { store: jest.fn().mockReturnValue(mockStore) };
    });

    it('should return empty array for empty navigationItems', async () => {
      const service = commonService({ strapi });

      const result = await service.mapToNavigationItemDTO({
        navigationItems: [],
        populate: undefined,
        locale: 'en',
      });

      expect(result).toEqual([]);
    });

    it('should return items without fetching related when __type or documentId is missing', async () => {
      const service = commonService({ strapi });
      const item = makeItem({ related: undefined });

      const result = await service.mapToNavigationItemDTO({
        navigationItems: [item],
        populate: undefined,
        locale: 'en',
      });

      expect(result).toHaveLength(1);
      expect(mockFindById).not.toHaveBeenCalled();
    });

    it('should fetch and attach related entity when item has related __type and documentId', async () => {
      const relatedEntity = { id: 5, title: 'Article', documentId: 'rel-doc' };
      mockFindById.mockResolvedValue(relatedEntity);

      const service = commonService({ strapi });
      const item = makeItem({
        related: { __type: 'api::article.article', documentId: 'rel-doc' },
      });

      const result = await service.mapToNavigationItemDTO({
        navigationItems: [item],
        populate: undefined,
        locale: 'en',
      });

      expect(mockFindById).toHaveBeenCalled();
      expect(result[0].related).toMatchObject({
        __type: 'api::article.article',
        documentId: 'rel-doc',
      });
    });
  });

  describe('pruneCustomFields()', () => {
    const mockFind = jest.fn();
    const mockSave = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
      (getNavigationItemRepository as jest.Mock).mockReturnValue({
        find: mockFind,
        save: mockSave,
      });
      mockSave.mockResolvedValue(undefined);
    });

    it('should remove specified custom fields from all navigation items', async () => {
      const item1 = makeItem({
        additionalFields: { fieldA: 'value1', fieldB: 'keep' },
      });
      const item2 = makeItem({
        additionalFields: { fieldA: 'value2', fieldB: 'keep' },
      });

      mockFind.mockResolvedValue([item1, item2]);

      const service = commonService({ strapi });

      await service.pruneCustomFields({
        removedFields: [{ name: 'fieldA', type: 'string', label: 'Field A', enabled: true }],
      });

      expect(mockSave).toHaveBeenCalledTimes(2);
      // Saved items should not include fieldA in additionalFields
      const firstCall = mockSave.mock.calls[0][0];
      expect(firstCall.item.additionalFields).not.toHaveProperty('fieldA');
      expect(firstCall.item.additionalFields).toHaveProperty('fieldB');
    });

    it('should do nothing when no navigation items match', async () => {
      mockFind.mockResolvedValue([]);

      const service = commonService({ strapi });

      await service.pruneCustomFields({
        removedFields: [{ name: 'fieldA', type: 'string', label: 'Field A', enabled: true }],
      });

      expect(mockSave).not.toHaveBeenCalled();
    });
  });

  describe('emitEvent()', () => {
    const mockGetModel = jest.fn();
    const mockEmit = jest.fn();

    const mockModel = {
      modelName: 'navigation',
      __schema__: { attributes: {} },
      attributes: {},
      getModel: () => mockModel,
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockGetModel.mockReturnValue(mockModel);
    });

    it('should emit webhook event when webhookRunner is present', async () => {
      (global as any).strapi = {
        getModel: mockGetModel,
        webhookRunner: { eventHub: { emit: mockEmit } },
      };

      const service = commonService({ strapi });

      await service.emitEvent({
        entity: { id: 1 },
        event: 'entry.update',
        uid: 'plugin::navigation.navigation',
      });

      expect(mockEmit).toHaveBeenCalledWith(
        'entry.update',
        expect.objectContaining({ model: 'navigation' })
      );
    });

    it('should warn when webhookRunner is not present', async () => {
      (global as any).strapi = {
        getModel: mockGetModel,
        webhookRunner: undefined,
      };

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const service = commonService({ strapi });

      await service.emitEvent({
        entity: { id: 1 },
        event: 'entry.create',
        uid: 'plugin::navigation.navigation',
      });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Webhook runner not present'));

      warnSpy.mockRestore();
    });
  });

  describe('readLocale()', () => {
    it('should return defaultLocale and restLocale', async () => {
      (global as any).strapi = {
        plugin: () => ({
          service: () => ({
            getDefaultLocale: jest.fn().mockResolvedValue('en'),
            find: jest.fn().mockResolvedValue([{ code: 'en' }, { code: 'pl' }, { code: 'de' }]),
          }),
        }),
      };

      const service = commonService({ strapi });
      const result = await service.readLocale();

      expect(result.defaultLocale).toBe('en');
      expect(result.restLocale).toEqual(['pl', 'de']);
    });

    it('should use first available locale as default when getDefaultLocale returns falsy', async () => {
      (global as any).strapi = {
        plugin: () => ({
          service: () => ({
            getDefaultLocale: jest.fn().mockResolvedValue(''),
            find: jest.fn().mockResolvedValue([{ code: 'pl' }, { code: 'de' }]),
          }),
        }),
      };

      const service = commonService({ strapi });
      const result = await service.readLocale();

      expect(result.defaultLocale).toBe('pl');
      expect(result.restLocale).toEqual(['de']);
    });
  });
  describe('index', () => {
    it('should export commonService as default', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const indexModule = require('../../src/services/common');

      expect(indexModule.default).toBe(commonService);
    });
  });

  describe('branch coverage edge cases', () => {
    const mockSave = jest.fn();
    const mockRemove = jest.fn();
    const mockAdminConfig = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();

      (getNavigationItemRepository as jest.Mock).mockReturnValue({
        save: mockSave,
        remove: mockRemove,
      });
      (getPluginService as jest.Mock).mockReturnValue({ config: mockAdminConfig });

      mockAdminConfig.mockResolvedValue({
        contentTypesNameFields: { default: ['title'] },
        pathDefaultFields: {},
      });
      mockSave.mockImplementation(({ item }) =>
        Promise.resolve({ ...item, id: faker.number.int(), documentId: faker.string.uuid() })
      );
      mockRemove.mockResolvedValue(undefined);
    });

    describe('updateBranch()', () => {
      it('should throw when depth reaches depthMax', async () => {
        const service = commonService({ strapi });

        await expect(
          service.updateBranch({
            action: {},
            masterEntity: getMasterEntity(),
            navigationItems: [],
            parentItem: undefined,
            depth: 2,
            depthMax: 2,
          })
        ).rejects.toThrow('Navigation item walk exceeded 2 items');
      });

      it('should use "Untitled" in the reserved path error when title is missing', async () => {
        const service = commonService({ strapi });
        const item = makeItem({ path: 'null', title: undefined as unknown as string });

        await expect(
          service.updateBranch({
            action: {},
            masterEntity: getMasterEntity(),
            navigationItems: [{ ...item, updated: true }],
            parentItem: undefined,
          })
        ).rejects.toThrow('Path "null" is reserved for Untitled');
      });

      it('should save without a locale when masterEntity is undefined', async () => {
        const service = commonService({ strapi });
        const item = makeItem();

        await service.updateBranch({
          action: {},
          masterEntity: undefined,
          navigationItems: [{ ...item, updated: true }],
          parentItem: undefined,
        });

        expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ locale: undefined }));
      });

      it('should pass the saved item as parent when analyzing children of an updated item', async () => {
        const service = commonService({ strapi });
        const masterEntity = getMasterEntity();
        const child = getNewNavigationItem({
          documentId: undefined,
          id: undefined,
          path: '/child',
          autoSync: false,
        });
        const parent = makeItem();

        const result = await service.updateBranch({
          action: {},
          masterEntity,
          navigationItems: [
            {
              ...parent,
              updated: true,
              items: [child as unknown as NavigationItemDBSchema],
            },
          ],
          parentItem: undefined,
        });

        // First save: updated parent, second save: created child referencing the parent
        expect(mockSave).toHaveBeenCalledTimes(2);
        const parentSaveResult = await mockSave.mock.results[0].value;
        expect(mockSave).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            item: expect.objectContaining({ parent: parentSaveResult.id }),
          })
        );
        expect(result.length).toBeGreaterThan(0);
      });
    });

    describe('createBranch()', () => {
      it('should use "Untitled" in the reserved path error when title is missing', async () => {
        const service = commonService({ strapi });
        const item = getNewNavigationItem({
          path: 'null',
          title: undefined,
          autoSync: false,
        });

        await expect(
          service.createBranch({
            action: {},
            masterEntity: getMasterEntity(),
            navigationItems: [item],
            parentItem: undefined,
          })
        ).rejects.toThrow('Path "null" is reserved for Untitled');
      });

      it('should link master and parent ids when provided', async () => {
        const service = commonService({ strapi });
        const masterEntity = getMasterEntity();
        const parentItem = makeItem();
        const item = getNewNavigationItem({ autoSync: false });

        await service.createBranch({
          action: {},
          masterEntity,
          navigationItems: [item],
          parentItem,
        });

        expect(mockSave).toHaveBeenCalledWith(
          expect.objectContaining({
            item: expect.objectContaining({ master: masterEntity.id, parent: parentItem.id }),
            locale: masterEntity.locale,
          })
        );
      });

      it('should leave master and parent undefined when not provided', async () => {
        const service = commonService({ strapi });
        const item = getNewNavigationItem({ autoSync: false });

        await service.createBranch({
          action: {},
          masterEntity: undefined,
          navigationItems: [item],
          parentItem: undefined,
        });

        expect(mockSave).toHaveBeenCalledWith(
          expect.objectContaining({
            item: expect.objectContaining({ master: undefined, parent: undefined }),
            locale: undefined,
          })
        );
      });

      it('should keep documentId and id and link master/parent when all are provided', async () => {
        const service = commonService({ strapi });
        const masterEntity = getMasterEntity();
        const parentItem = makeItem();
        const documentId = faker.string.uuid();
        const id = faker.number.int();
        const item = getNewNavigationItem({ documentId, id, autoSync: false });

        await service.createBranch({
          action: {},
          masterEntity,
          navigationItems: [item],
          parentItem,
        });

        expect(mockSave).toHaveBeenCalledWith(
          expect.objectContaining({
            item: expect.objectContaining({
              documentId,
              id,
              master: masterEntity.id,
              parent: parentItem.id,
            }),
          })
        );
      });

      it('should fall back to the "en" locale when generating fields without masterEntity', async () => {
        const mockFindById = jest.fn().mockResolvedValue({ id: 1, title: 'Generated' });
        (getGenericRepository as jest.Mock).mockReturnValue({ findById: mockFindById });

        const service = commonService({ strapi });
        const item = getNewNavigationItem({ autoSync: true, title: '', path: '' });

        await service.createBranch({
          action: {},
          masterEntity: undefined,
          navigationItems: [item],
          parentItem: undefined,
        });

        expect(mockFindById).toHaveBeenCalledWith(
          item.related!.documentId,
          undefined,
          'published',
          { locale: 'en' }
        );
      });

      it('should combine inner actions with the outer action for nested items', async () => {
        const service = commonService({ strapi });
        const child = getNewNavigationItem({ title: 'Child', path: '/child', autoSync: false });
        const parent = getNewNavigationItem({
          title: 'Parent',
          path: '/parent',
          autoSync: false,
          items: [child],
        });
        const action = {};

        const result = await service.createBranch({
          action,
          masterEntity: getMasterEntity(),
          navigationItems: [parent],
          parentItem: undefined,
        });

        expect(result).toHaveLength(2);
        expect(result[result.length - 1]).toBe(action);
      });

      it('should enforce depth cap with default depthMax when depth is beyond it', async () => {
        const service = commonService({ strapi });

        await expect(
          service.createBranch({
            action: {},
            masterEntity: getMasterEntity(),
            navigationItems: [],
            parentItem: undefined,
            depth: Number.MAX_SAFE_INTEGER,
          })
        ).rejects.toThrow('Navigation item walk exceeded');
      });
    });

    describe('removeBranch()', () => {
      it('should use default arguments', async () => {
        const service = commonService({ strapi });

        await expect(service.removeBranch({})).resolves.toEqual([]);
        expect(mockRemove).not.toHaveBeenCalled();
      });

      it('should mark provided action as remove', async () => {
        const service = commonService({ strapi });
        const action: { remove?: boolean } = {};

        const result = await service.removeBranch({
          navigationItems: [makeItem()],
          action,
        });

        expect(action.remove).toBe(true);
        expect(result).toEqual([action]);
      });
    });

    describe('analyzeBranch()', () => {
      it('should use default arguments', async () => {
        const service = commonService({ strapi });

        await expect(
          service.analyzeBranch({ masterEntity: getMasterEntity() } as any)
        ).resolves.toEqual([]);
      });

      it('should ignore items that have no documentId and are removed', async () => {
        const service = commonService({ strapi });
        const ignored = { ...makeItem({ documentId: undefined }), removed: true };

        const result = await service.analyzeBranch({
          masterEntity: getMasterEntity(),
          navigationItems: [ignored] as unknown as NavigationItemDBSchema[],
          prevAction: {},
        });

        expect(result).toEqual([]);
        expect(mockSave).not.toHaveBeenCalled();
        expect(mockRemove).not.toHaveBeenCalled();
      });

      it('should update changed items and analyze their children', async () => {
        const service = commonService({ strapi });
        const child = getNewNavigationItem({
          documentId: undefined,
          id: undefined,
          path: '/child',
          autoSync: false,
        });
        const parent = {
          ...makeItem(),
          removed: false,
          updated: true,
          items: [child],
        };

        const result = await service.analyzeBranch({
          masterEntity: getMasterEntity(),
          navigationItems: [parent] as unknown as NavigationItemDBSchema[],
          prevAction: {},
        });

        expect(mockSave).toHaveBeenCalledTimes(2);
        expect(result.length).toBeGreaterThan(0);
      });
    });

    describe('mapToNavigationItemDTO()', () => {
      const mockFindById = jest.fn();

      const config = {
        contentTypes: [],
        contentTypesNameFields: { default: ['title'] },
        contentTypesPopulate: { 'api::article.article': ['cover'] },
        additionalFields: [],
        pathDefaultFields: {},
        allowedLevels: 2,
        cascadeMenuAttached: true,
        gql: { navigationItemRelated: [] },
        preferCustomContentTypes: false,
        defaultContentType: '',
      };

      beforeEach(() => {
        (getGenericRepository as jest.Mock).mockReturnValue({ findById: mockFindById });
        mockFindById.mockResolvedValue({ id: 1, title: 'Related' });
        (global as any).strapi = {
          store: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(config) }),
        };
      });

      it('should use configured populate fields and published status by default', async () => {
        const service = commonService({ strapi });
        const documentId = faker.string.uuid();

        await service.mapToNavigationItemDTO({
          navigationItems: [makeItem({ related: { __type: 'api::article.article', documentId } })],
          populate: undefined,
          locale: 'pl',
        });

        expect(mockFindById).toHaveBeenCalledWith(documentId, ['cover'], 'published', {
          locale: 'pl',
        });
      });

      it('should prefer explicit populate and status', async () => {
        const service = commonService({ strapi });
        const documentId = faker.string.uuid();

        await service.mapToNavigationItemDTO({
          navigationItems: [makeItem({ related: { __type: 'api::article.article', documentId } })],
          populate: ['author'],
          status: 'draft',
          locale: 'en',
        });

        expect(mockFindById).toHaveBeenCalledWith(documentId, ['author'], 'draft', {
          locale: 'en',
        });
      });

      it('should map nested items and assign parent', async () => {
        const service = commonService({ strapi });
        const child = makeItem({ items: [], related: undefined });
        const root = makeItem({ items: [child], related: undefined });

        const result = await service.mapToNavigationItemDTO({
          navigationItems: [root],
          populate: undefined,
          locale: 'en',
        });

        expect(result).toHaveLength(1);
        expect(result[0].items).toHaveLength(1);
        expect(result[0].items?.[0].parent).toMatchObject({ documentId: root.documentId });
      });

      it('should keep the provided parent for nested items', async () => {
        const service = commonService({ strapi });
        const parent = { documentId: faker.string.uuid() } as any;
        const item = makeItem({ items: [], related: undefined });

        const result = await service.mapToNavigationItemDTO({
          navigationItems: [item],
          populate: undefined,
          parent,
          locale: 'en',
        });

        expect(result[0].parent).toBe(parent);
      });

      it('should default missing items to an empty list', async () => {
        const service = commonService({ strapi });
        const item = makeItem({ related: undefined });
        delete (item as any).items;

        const result = await service.mapToNavigationItemDTO({
          navigationItems: [item],
          populate: undefined,
          locale: 'en',
        });

        expect(result[0].items).toEqual([]);
      });

      it('should skip fetching when related has no documentId', async () => {
        const service = commonService({ strapi });

        await service.mapToNavigationItemDTO({
          navigationItems: [
            makeItem({ related: { __type: 'api::article.article' } as any, items: [] }),
          ],
          populate: undefined,
          locale: 'en',
        });

        expect(mockFindById).not.toHaveBeenCalled();
      });
    });

    describe('items-less branches', () => {
      it('removeBranch should handle items being undefined', async () => {
        const service = commonService({ strapi });
        const item = makeItem();
        delete (item as any).items;

        await expect(service.removeBranch({ navigationItems: [item] })).resolves.toHaveLength(1);
      });

      it('createBranch should handle items being undefined', async () => {
        const service = commonService({ strapi });
        const item = getNewNavigationItem({ autoSync: false });
        delete (item as any).items;

        await expect(
          service.createBranch({
            action: {},
            masterEntity: getMasterEntity(),
            navigationItems: [item],
            parentItem: undefined,
          })
        ).resolves.toHaveLength(1);
      });

      it('createBranch should keep documentId and id without master/parent', async () => {
        const service = commonService({ strapi });
        const documentId = faker.string.uuid();
        const id = faker.number.int();
        const item = getNewNavigationItem({ documentId, id, autoSync: false });

        await service.createBranch({
          action: {},
          masterEntity: undefined,
          navigationItems: [item],
          parentItem: undefined,
        });

        expect(mockSave).toHaveBeenCalledWith(
          expect.objectContaining({
            item: expect.objectContaining({
              documentId,
              id,
              master: undefined,
              parent: undefined,
            }),
          })
        );
      });

      it('updateBranch should handle items being undefined', async () => {
        const service = commonService({ strapi });
        const item = makeItem();
        delete (item as any).items;

        await expect(
          service.updateBranch({
            action: {},
            masterEntity: getMasterEntity(),
            navigationItems: [{ ...item, updated: false }],
            parentItem: undefined,
          })
        ).resolves.toHaveLength(1);
      });
    });

    describe('getSlug()', () => {
      const mockCount = jest.fn();

      beforeEach(() => {
        (getNavigationItemRepository as jest.Mock).mockReturnValue({ count: mockCount });
      });

      it('should not suffix the slug when it is unique', async () => {
        mockCount.mockResolvedValue(0);

        const service = commonService({ strapi });

        await expect(service.getSlug({ query: 'Unique Slug' })).resolves.toBe('unique-slug');
      });

      it('should return an empty slug without querying when query slugifies to empty', async () => {
        const service = commonService({ strapi });

        await expect(service.getSlug({ query: '' })).resolves.toBe('');
        expect(mockCount).not.toHaveBeenCalled();
      });
    });

    describe('emitEvent()', () => {
      it('should pass sanitized entity and model name to the event hub', async () => {
        const emit = jest.fn();
        const model = {
          modelName: 'navigation',
          __schema__: { attributes: {} },
        };
        (global as any).strapi = {
          getModel: jest.fn().mockReturnValue(model),
          webhookRunner: { eventHub: { emit } },
        };

        const { sanitize } = jest.requireMock('@strapi/utils');
        sanitize.sanitizers.defaultSanitizeOutput.mockImplementationOnce(
          async (schema: any, entity: any) => {
            expect(schema.getModel()).toBe(model);
            expect(schema.schema).toBe(model.__schema__);
            return { sanitized: entity.id };
          }
        );

        const service = commonService({ strapi });

        await service.emitEvent({
          entity: { id: 7 },
          event: 'entry.update',
          uid: 'plugin::navigation.navigation',
        });

        expect(emit).toHaveBeenCalledWith('entry.update', {
          model: 'navigation',
          entry: { sanitized: 7 },
        });
      });
    });

    describe('buildNestedStructure()', () => {
      it('should sort items by order', () => {
        const service = commonService({ strapi });
        const a = makeItem({ order: 3, parent: undefined, items: [] });
        const b = makeItem({ order: 1, parent: undefined, items: [] });
        const c = makeItem({ order: 2, parent: undefined, items: [] });

        const result = service.buildNestedStructure({ navigationItems: [a, b, c] });

        expect(result.map((item) => item.order)).toEqual([1, 2, 3]);
      });
    });
  });

  describe('utils edge cases', () => {
    describe('checkDuplicatePath()', () => {
      it('should describe the parent as "root" when it has no title', async () => {
        await expect(
          checkDuplicatePath({
            checkData: [{ title: 'New', path: '/dup', type: 'INTERNAL', id: 10 }],
            parentItem: {
              title: '',
              type: 'INTERNAL',
              items: [{ title: 'Existing', path: '/dup', type: 'INTERNAL', id: 5 }],
            },
          })
        ).rejects.toThrow('Duplicate path:/dup in parent: root for New and Existing items');
      });
    });

    describe('generateFieldsFromRelated()', () => {
      const mockFindById = jest.fn();

      beforeEach(() => {
        jest.clearAllMocks();
        (getGenericRepository as jest.Mock).mockReturnValue({ findById: mockFindById });
      });

      it('should skip empty path fields and use the first truthy one', async () => {
        mockFindById.mockResolvedValue({ id: 1, name: 'N', slug: '', alias: 'alias' });

        const result = await generateFieldsFromRelated(
          { strapi },
          { __type: 'api::article.article', documentId: 'doc' },
          'en',
          { default: ['name'] },
          { 'api::article.article': ['slug', 'alias', 'other'] }
        );

        expect(result.path).toBe('alias');
      });

      it('should return the first truthy title and not evaluate later fields', async () => {
        mockFindById.mockResolvedValue({ id: 1, title: 'First', name: 'Second' });

        const result = await generateFieldsFromRelated(
          { strapi },
          { __type: 'api::article.article', documentId: 'doc' },
          'en',
          { default: ['title', 'name'] },
          { 'api::article.article': ['title', 'name'] }
        );

        expect(result).toEqual({ title: 'First', path: 'First' });
      });

      it('should return empty fields when the related entity is not found', async () => {
        mockFindById.mockResolvedValue(null);

        await expect(
          generateFieldsFromRelated(
            { strapi },
            { __type: 'api::article.article', documentId: 'doc' },
            'en',
            { default: ['title'] },
            { 'api::article.article': ['slug'] }
          )
        ).resolves.toEqual({ title: undefined, path: undefined });
      });

      it('should return empty title when no field matches and path from id', async () => {
        mockFindById.mockResolvedValue({ id: 3 });

        const result = await generateFieldsFromRelated(
          { strapi },
          { __type: 'api::article.article', documentId: 'doc' },
          'en',
          { default: ['title'] },
          {}
        );

        expect(result).toEqual({ title: undefined, path: '3' });
      });
    });
  });
});
