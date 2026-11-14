import { navigationItemCountMax, pathReserved, pathSegmentAbsent } from '../../../shared/path';

export { navigationItemCountMax, pathReserved, pathSegmentAbsent };

export const composeNavigationPath = (
  ancestorPath: string | null | undefined,
  itemPath: string | null | undefined,
  isManualPath: boolean
): string | null => {
  if (pathSegmentAbsent(itemPath)) {
    return null;
  }

  const presentPath = itemPath ?? '';

  if (isManualPath) {
    return presentPath;
  }

  const prefix = ancestorPath === '/' || pathSegmentAbsent(ancestorPath) ? '' : ancestorPath;
  const segment = presentPath.startsWith('/') ? presentPath.substring(1) : presentPath;

  return `${prefix}/${segment}`;
};

export const renderedItemPath = (path: string | null | undefined): string | null | undefined =>
  pathReserved(path) ? null : path;
