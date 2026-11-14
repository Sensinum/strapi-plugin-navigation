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

The file rewrites rows whose `path` is the exact string `null` to SQL `NULL`. `"null"` is the legacy spelling of a missing segment, and new writes of that string are rejected. A blank path stays an empty string.
