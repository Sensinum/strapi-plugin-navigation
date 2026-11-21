/**
 * "null" is the legacy spelling of a missing segment, and new writes are rejected.
 * An empty string is a blank path, not a missing segment.
 */
export const pathReserved = (path: string | null | undefined): boolean => path === 'null';

export const pathSegmentAbsent = (path: string | null | undefined): boolean =>
  path === null || path === undefined || pathReserved(path);

export const navigationItemCountMax = 10000;
