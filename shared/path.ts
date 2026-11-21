/**
 * "null" is the legacy spelling of a missing segment, and new writes are rejected.
 * An empty string is also treated as a missing segment, same as null.
 */
export const pathReserved = (path: string | null | undefined): boolean => path === 'null';

export const pathSegmentAbsent = (path: string | null | undefined): boolean =>
  path === null || path === undefined || path === '' || pathReserved(path);

export const navigationItemCountMax = 10000;

/**
 * The path that children of an item inherit when the item has no segment of its own.
 */
export const inheritedNavigationPath = (ancestorPath: string | null | undefined): string =>
  pathSegmentAbsent(ancestorPath) || ancestorPath === '/' ? '' : (ancestorPath as string);

/**
 * The full path of an item, or null when the item has no segment of its own.
 * Rendering and matching both use this function.
 */
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

  const prefix = inheritedNavigationPath(ancestorPath);
  const segment = presentPath === '/' ? '' : presentPath.replace(/^\//, '');

  return `${prefix}/${segment}`.replace(/\/{2,}/g, '/');
};
