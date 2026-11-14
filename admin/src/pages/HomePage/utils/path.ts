import {
  navigationItemCountMax,
  pathReserved,
  pathSegmentAbsent,
} from '../../../../../shared/path';

export { navigationItemCountMax, pathReserved, pathSegmentAbsent };

export interface ReservedPathItem {
  type?: string | null;
  path?: string | null;
  title?: string | null;
  items?: ReservedPathItem[] | null;
}

export const reservedPathTitles = (items: ReservedPathItem[]): string[] => {
  const pending: ReservedPathItem[] = [];

  for (let index = 0; index < items.length; index += 1) {
    pending.push(items[index]);
  }

  const seen = new Set<ReservedPathItem>();
  const titles: string[] = [];

  while (pending.length > 0) {
    const item = pending.pop();

    if (item === undefined || seen.has(item)) {
      continue;
    }

    seen.add(item);

    const visitedCount = seen.size;

    if (visitedCount > navigationItemCountMax) {
      throw new Error(`Navigation item walk exceeded ${navigationItemCountMax} items`);
    }

    if ((item.type === 'INTERNAL' || item.type === 'WRAPPER') && pathReserved(item.path)) {
      titles.push(item.title || 'Untitled');
    }

    const children = item.items ?? [];

    for (let index = 0; index < children.length; index += 1) {
      pending.push(children[index]);
    }
  }

  return titles;
};

export const navigationAbsolutePath = (
  levelPath: string,
  itemPath: string | null | undefined,
  isManualPath: boolean
): string => {
  if (pathSegmentAbsent(itemPath)) {
    return levelPath === '/' ? '' : levelPath;
  }

  const presentPath = itemPath ?? '';

  if (isManualPath) {
    return presentPath;
  }

  const prefix = levelPath === '/' ? '' : levelPath;
  const segment = presentPath === '/' ? '' : presentPath;

  return `${prefix}/${segment}`.replace('//', '/');
};
