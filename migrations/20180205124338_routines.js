exports.up = async knex => {
  return await knex.schema.createTable("routines", table => {
    table.increments("id").primary();
    table.integer("timestamp").notNullable();

    table.integer("finished_timestamp").nullable();
  });
};

exports.down = async knex => {
  return await knex.schema.dropTable("routines");
};
