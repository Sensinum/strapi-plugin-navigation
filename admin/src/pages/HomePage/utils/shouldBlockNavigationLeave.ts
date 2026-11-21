interface NavigationLocation {
  pathname: string;
  search: string;
};

/**
 * Same rule as the Content Manager leave prompt: block when the navigation
 * tree is dirty and the next URL path or query string differs.
 */
export const shouldBlockNavigationLeave = (
  hasUnsavedChanges: boolean,
  currentLocation: NavigationLocation,
  nextLocation: NavigationLocation
) => {
  if (!hasUnsavedChanges) {
    return false;
  }

  return (
    currentLocation.pathname !== nextLocation.pathname ||
    currentLocation.search !== nextLocation.search
  );
};
