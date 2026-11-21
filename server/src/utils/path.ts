import {
  composeNavigationPath,
  inheritedNavigationPath,
  navigationItemCountMax,
  pathReserved,
  pathSegmentAbsent,
} from '../../../shared/path';

export {
  composeNavigationPath,
  inheritedNavigationPath,
  navigationItemCountMax,
  pathReserved,
  pathSegmentAbsent,
};

export const renderedItemPath = (path: string | null | undefined): string | null | undefined =>
  pathSegmentAbsent(path) ? null : path;
