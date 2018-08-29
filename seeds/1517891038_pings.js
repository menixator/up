exports.seed = async knex => {
  await knex("pings").del();

  let routines = await knex("routines").select("*");
  let devices = await knex("devices").select("*");

  for (let device of devices) {
    for (let routine of routines) {
      await knex("pings").insert({
        rtt: Math.floor(Math.random() * 100),
        failed: 0,
        device_id: device.id,
        timestamp: Date.now(),
        routine_id: routine.id
      });
    }
  }
};
