const TABLE_NAME = 'navigations_items';

module.exports = {
  async up(knex) {
    // "null" is the legacy spelling of a missing segment, and new writes are rejected.
    const updatedCount = await knex(TABLE_NAME).where({ path: 'null' }).update({ path: null });

    console.log(
      `Navigation plugin :: Migrations :: Reserved path "null" rewritten on ${updatedCount} rows`
    );
  },
};
