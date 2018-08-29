exports.up = async knex => {
  return await knex.schema.createTable("pings", table => {
    table.increments("id").primary();
    table.integer("rtt").nullable();

    table.integer("failed").notNullable();
    table
      .integer("routine_id")
      .references("routines.id")
      .notNullable()
      .onDelete("cascade")
      .onUpdate("cascade");

    table
      .integer("device_id")
      .references("devices.id")
      .notNullable()
      .onDelete("cascade")
      .onUpdate("cascade");

    table.integer("timestamp").notNullable();
  });
};

exports.down = async knex => {
  return await knex.schema.dropTable("pings");
};
