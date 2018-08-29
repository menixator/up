exports.seed = async knex => {
  await knex("routines").del();

  await knex("routines").insert([{ timestamp: Date.now() }]);
};
