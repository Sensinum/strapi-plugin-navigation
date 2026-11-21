# ♻️ Migration Guide

## From

- `v2.x`
- `3.0.0-beta.x`

## To

- `3.0.0`

## Steps

To properly migrate the plugin please copy the following migration files to your project `database/migrations` directory:

- `migrations/strapi-plugin-navigation-3.0.0-no-1-related-id-to-documentid.js` - **if you're on any of the `2.x` versions**
- `migrations/strapi-plugin-navigation-3.0.0-no-2-locale-slug-regular-slug.js` - **if you're on version `< 3.0.0-beta.4`**
- `migrations/strapi-plugin-navigation-3.0.0-no-3-morph-relation.js` - **if you're on version `< 3.0.0-beta.6`**
- `migrations/strapi-plugin-navigation-3.0.0-no-4-additional-fields.js` - **if you're on any of the `2.x` versions**

More about applying database migrations you can find in [**Strapi 5 Documentation**](https://docs.strapi.io/dev-docs/database-migrations).

## Reserved path `null`

Copy `migrations/strapi-plugin-navigation-3.4.3-no-1-null-path.js` into the project `database/migrations` directory.

The file rewrites rows whose `path` is the exact string `null` to SQL `NULL`. `"null"` is the legacy spelling of a missing segment, and new writes of that string are rejected. A blank path (`""`) is treated the same as a missing segment.

## Path matching and `absolutePath`

- `GET /api/navigation/render/<id>?path=...` matches an item by its full path, so `/null/test` no longer matches an item under a parent without a path. Previously it could match by substring, which also returned siblings such as `/testing` for `/test`. Now the matched item and its children are returned. An item without a path of its own is not matched by its parent's path, but its children are still reachable.
- FLAT responses include a new `absolutePath` field (also in GraphQL) with the item's full path, or `null` if the item has no path of its own. `path` keeps the item's own segment; a blank `path` is now returned as `null`.
- TREE and RFR responses are unchanged, apart from the matching rules above.
