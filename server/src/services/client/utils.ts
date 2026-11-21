import { find, get, isArray, isEmpty, isNil, isString, last, zipWith } from 'lodash';
import { NavigationItemDTO } from '../../dtos';
import { StrapiContentTypeFullSchema } from '../../types';
import { composeNavigationPath, inheritedNavigationPath } from '../../utils/path';
import { NestedPath } from './types';

export const composeItemTitle = (
  item: NavigationItemDTO,
  fields: Record<string, string[]> = {},
  contentTypes: StrapiContentTypeFullSchema[] = []
): string | undefined => {
  const { title, related } = item;
  const lastRelated = isArray(related) ? last(related) : related;

  if (title) {
    return isString(title) && !isEmpty(title) ? title : undefined;
  } else if (lastRelated) {
    const relationTitle = extractItemRelationTitle(lastRelated, fields, contentTypes);
    return isString(relationTitle) && !isEmpty(relationTitle) ? relationTitle : undefined;
  }
  return undefined;
};

export const extractItemRelationTitle = (
  relatedItem: any,
  fields: Record<string, string[]> = {},
  contentTypes: StrapiContentTypeFullSchema[] = []
) => {
  const { __contentType } = relatedItem;
  const contentType = find(contentTypes, (_) => _.contentTypeName === __contentType);
  const { default: defaultFields = [] } = fields;

  return (
    get(fields, `${contentType ? contentType.collectionName : ''}`, defaultFields)
      .map((_) => relatedItem[_])
      .filter((_) => _)[0] || ''
  );
};

/**
 * Returns a resolver that gives the render-order key (the chain of `order` values from the root
 * down to the item) for an item. Both FLAT sorting and `?path=` tie-breaking use it.
 */
export const createNestedOrdersResolver = <
  T extends Pick<NavigationItemDTO, 'parent' | 'documentId' | 'order'>,
>(
  items: T[]
) => {
  const itemsById = new Map<string, T>(items.map((item) => [item.documentId, item]));
  const cache = new Map<string, number[]>();

  const resolve = (documentId: string): number[] => {
    const cached = cache.get(documentId);
    if (!isNil(cached)) return cached;

    const item = itemsById.get(documentId);

    if (isNil(item)) return [];

    const { order, parent } = item;
    const nestedOrders = parent ? resolve(parent.documentId).concat(order) : [order];

    cache.set(documentId, nestedOrders);

    return nestedOrders;
  };

  return resolve;
};

/**
 * Finds the item whose own full path equals `path` and returns it together with its descendants.
 * Descendants are collected through the parent chain, not by comparing path strings.
 * If several items share the same full path, the first one in render order wins.
 */
export const filterByPath = <
  T extends Pick<NavigationItemDTO, 'parent' | 'documentId' | 'path' | 'isManualPath' | 'order'>,
>(
  items: T[],
  path?: string | null
): { root?: NestedPath; items: T[] } => {
  if (isNil(path)) {
    return { root: undefined, items };
  }

  const resolveOrders = createNestedOrdersResolver(items);
  const [root] = buildNestedPaths(items)
    .filter((nested) => nested.absolutePath === path)
    .sort((a, b) =>
      compareArraysOfNumbers(resolveOrders(a.documentId ?? ''), resolveOrders(b.documentId ?? ''))
    );

  if (isNil(root)) {
    return { root: undefined, items: [] };
  }

  const childrenByParent = new Map<string, string[]>();

  items.forEach(({ documentId, parent }) => {
    const parentId = parent?.documentId;

    if (!parentId) return;

    const siblings = childrenByParent.get(parentId);

    if (siblings) {
      siblings.push(documentId);
    } else {
      childrenByParent.set(parentId, [documentId]);
    }
  });

  const included = new Set<string>();
  const queue = [root.documentId ?? ''];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];

    if (included.has(current)) continue;

    included.add(current);
    queue.push(...(childrenByParent.get(current) ?? []));
  }

  return {
    root,
    items: items.filter(({ documentId }) => included.has(documentId)),
  };
};

export const buildNestedPaths = <
  T extends Pick<NavigationItemDTO, 'parent' | 'documentId' | 'path' | 'isManualPath'>,
>(
  items: T[],
  documentId?: string,
  parentPath: string | null = null,
  depth = 0
): NestedPath[] => {
  const childrenByParent = new Map<string | undefined, T[]>();

  items.forEach((item) => {
    const parentId = item.parent?.documentId;
    const siblings = childrenByParent.get(parentId);

    if (siblings) {
      siblings.push(item);
    } else {
      childrenByParent.set(parentId, [item]);
    }
  });

  const walk = (
    parentDocumentId: string | undefined,
    ancestorPath: string | null,
    walkDepth: number
  ): NestedPath[] => {
    if (walkDepth > items.length) {
      throw new Error(`Navigation path walk exceeded ${items.length} items`);
    }

    return (childrenByParent.get(parentDocumentId) ?? []).reduce<NestedPath[]>(
      (acc, entity): NestedPath[] => {
        const absolutePath = composeNavigationPath(
          ancestorPath,
          entity.path,
          !!entity.isManualPath
        );
        const path = absolutePath ?? inheritedNavigationPath(ancestorPath);

        return [
          {
            documentId: entity.documentId,
            absolutePath,
            parent: entity.parent?.documentId
              ? {
                  id: entity.parent.id,
                  documentId: entity.parent.documentId,
                  path: inheritedNavigationPath(ancestorPath),
                }
              : undefined,
            path,
          },
          ...walk(entity.documentId, path, walkDepth + 1),
          ...acc,
        ];
      },
      []
    );
  };

  return walk(documentId, parentPath, depth);
};

export const compareArraysOfNumbers = (arrA: number[], arrB: number[]) => {
  const diff = zipWith(arrA, arrB, (a, b) => {
    if (isNil(a)) return -1;
    if (isNil(b)) return 1;
    return a - b;
  });
  return find(diff, (a) => a !== 0) || 0;
};
