export const isContentManagerType = (uid?: string) =>
  Boolean(uid?.includes('api::') || uid?.includes('plugin::'));
