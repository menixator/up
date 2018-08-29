exports.up = async knex => {
  return await knex.schema.createTable("devices", table => {
    table.increments("id").primary();
    table.string("name").notNullable();
    table.string("address").unique();
    table.string("descr").nullable();
    table
      .boolean("disabled")
      .defaultTo(0)
      .notNullable();
  });
};

exports.down = async knex => {
  return await knex.schema.dropTable("devices");
};
