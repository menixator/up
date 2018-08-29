const radio = require("./radio");
const pinger = require("./pinger");
const TIMEOUT = 5 * 60 * 1000;

const knex = require("./knex");

class Mediator {
  constructor() {
    this._timeout = null;
  }

  start() {
    if (this._timeout) this.clearTimeout();

    setTimeout(this.tick.bind(this), 0);
  }

  async addPingToDatabase(row) {
    let [id] = await knex("pings")
      .insert(row)
      .returning("id");
    row.id = id;
    radio.emit("ping_done", row);
    return id;
  }

  async tick() {
    await knex("routines")
      .update("finished_timestamp", 0)
      .where("finished_timestamp", null);

    let count = await knex("devices")
      .count("* as value")
      .first();

    if (count.value > 0) {
      let timestamp = Date.now();

      let routineId = await knex("routines").insert({ timestamp }, "id");

      if (routineId.length === 0) return this.tick();

      routineId = routineId[0];

      // emit a message over the radio
      radio.emit("new_routine", { id: routineId, timestamp });

      let offset = 0;

      while (true) {
        let device = await knex("devices")
          .select("*")
          .limit(1)
          .offset(offset)
          .first();

        if (device === undefined) break;

        let timestamp = Date.now();
        try {
          let pingResult = await pinger.ping(device.address);

          await this.addPingToDatabase({
            routine_id: routineId,
            device_id: device.id,
            rtt: pingResult.rtt,
            timestamp,
            failed: 0
          });
        } catch (err) {
          await this.addPingToDatabase({
            routine_id: routineId,
            device_id: device.id,
            rtt: null,
            timestamp,
            failed: 1
          });
        }

        offset++;
      }
      radio.emit("routine_end", { id: routineId, timestamp });
      await knex("routines")
        .update({ finished_timestamp: Date.now() })
        .where("id", "=", routineId);
    }
    this._timeout = setTimeout(() => {
      process.nextTick(this.tick.bind(this));
    }, TIMEOUT);
  }

  clearTimeout() {
    clearTimeout(this._timeout);
    this._timeout = null;
  }
}

module.exports = Mediator;
