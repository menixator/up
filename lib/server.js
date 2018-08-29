const knex = require("./knex");
const http = require("http");
const _ = require("lodash");
const utils = require("./utils");
const express = require("express");
const bp = require("body-parser");
const { APIError } = require("./errors");
const path = require("path");
const { wrap } = utils;
const app = express();

const api = express.Router();
const API_PREFIX = "/api/v1";

api.use(function(req, res, next) {
  req.rows = {};
  res.meta = { sql: [] };
  req.meta = {};
  res.type("json");
  return next();
});

api.use(function(req, res, next) {
  // parsing the filter

  if (req.query.filter) {
    if (_.isPlainObject(req.query.filter)) {
      req.meta.filter = req.query.filter;
    }
    return next();
  }

  next();
});

["devices", "pings", "routines"].forEach(table => {
  let singularTableName = table.slice(0, -1);

  let tableId = singularTableName + "Id";
  api.param(
    tableId,
    wrap(async (req, res, next) => {
      if (!_.has(req.params, tableId)) {
        return next(
          new APIError({ message: `${singularTableName} id is missing`, status: 400 })
        );
      }

      let id = req.params[tableId];

      // Special case for routines.
      if (id === "latest" && table === "routines") {
        let latest = await knex("routines")
          .select("id")
          .orderBy("id", "desc")
          .limit(1)
          .first();
        if (latest === undefined) {
          return next(new APIError({ message: "No routines", status: 404 }));
        }
        id = latest.id;
      }

      id = _.parseInt(id);

      if (!_.isSafeInteger(id) || id <= 0) {
        return next(
          new APIError({
            message: `id can only be a positive integer for the table ${table}`,
            status: 400
          })
        );
      }

      let query = knex(table)
        .select("*")
        .where({ id: id });

      let result = await query;

      req.meta[tableId] = id;
      if (result.length === 0) {
        return next(
          new APIError({
            message: `could not find any matching records from the table ${table}`,
            status: 404,
            meta: req.meta
          })
        );
      }

      req.rows[singularTableName] = result[0];
      req.params[tableId] = id;

      next();
    })
  );

  api.get(
    `/${table}/:${tableId}`,
    wrap(async (req, res) => {
      let requestedId = req.params[tableId];
      let row = req.rows[singularTableName];
      let relationships = {};
      switch (table) {
        case "routines":
          // adds how many pings failed to a routine fetch.
          let routineMeta = await knex
            .select(
              knex
                .count()
                .from("pings")
                .where("failed", "=", 1)
                .where("routine_id", requestedId)
                .as("failed"),
              knex
                .count()
                .from("pings")
                .where("routine_id", requestedId)
                .as("total")
            )
            .first();

          res.meta.finished = row.finished_timestamp !== null;
          _.extend(res.meta, routineMeta);

          break;

        case "pings":
          relationships.device = { data: { type: "devices", id: row.device_id } };
          delete row.device_id;

          relationships.routine = { data: { type: "routines", id: row.routine_id } };
          delete row.routine_id;

          break;
      }

      res.status(200).json({
        data: {
          type: table,
          id: requestedId,
          attributes: _.omit(row, "id"),
          ...(_.keys(res.meta).length > 0 ? { meta: res.meta } : {}),
          ...(_.keys(relationships).length > 0 ? { relationships } : {})
        }
      });
    })
  );

  // GET /routines
  api.get(
    `/${table}`,
    wrap(async (req, res) => {
      let offset = utils.parseQuery(
        req.query,
        "offset",
        _.parseInt,
        v => _.isSafeInteger(v) && v > 0,
        0
      );

      req.meta.offset = offset;

      let limit = utils.parseQuery(
        req.query,
        "limit",
        _.parseInt,
        v => _.isSafeInteger(v),
        20
      );

      req.meta.limit = limit;

      let sort = utils.parseQuery(
        req.query,
        "sort",
        order => {
          switch (order.trim().toLowerCase()) {
            case "desc":
              return "desc";

            case "default":
            case "asc":
              return "asc";
          }
        },
        () => true,
        "asc"
      );

      req.meta.sort = sort;

      let query = knex(table).select("*");

      switch (table) {
        case "routines":
          query
            .clearSelect()
            .select("routines.id", "routines.timestamp", "routines.finished_timestamp")
            .sum("pings.failed as failed")
            .count("pings.id as total")
            .innerJoin("pings", "routines.id", "pings.routine_id")
            .groupBy("routines.id");

          break;

        case "pings":
          let failed = utils.parseQuery(
            req.meta.filter || {},
            "failed",
            utils.booleanParser,
            v => v !== null,
            null
          );

          if (failed !== null) {
            query.where({ failed: failed ? 1 : 0 });
          }

          let deviceId = utils.parseQuery(
            req.meta.filter || {},
            "deviceId",
            _.parseInt,
            v => _.isSafeInteger(v) && v > 0,
            null
          );

          if (deviceId !== null) {
            query.where({ device_id: deviceId });
          }

          let routineId = utils.parseQuery(
            req.meta.filter || {},
            "routineId",
            _.parseInt,
            v => _.isSafeInteger(v) && v > 0,
            null
          );

          if (routineId !== null) {
            query.where({ routine_id: routineId });
          }

          break;
      }
      if (sort === "desc") {
        query.orderBy(`${table}.id`, "desc");
      }

      let prelude = await knex
        .with("raw_query", query.clone())
        .count()
        .count("* as totalRows")
        .first()
        .from("raw_query");

      let totalRows = (prelude && prelude.totalRows) || 0;

      let isLastPage = offset >= totalRows - limit;

      let links = {
        first: offset === 0 ? null : `${API_PREFIX}/${table}/?offset=0&limit=${limit}`,
        prev:
          offset === 0
            ? null
            : `${API_PREFIX}/${table}/?offset=${offset - limit}&limit=${limit}`,
        self: `${API_PREFIX}/${table}/?offset=${offset}&limit=${limit}`,
        next: isLastPage
          ? null
          : `${API_PREFIX}/${table}/?offset=${offset + limit}&limit=${limit}`,
        last: isLastPage
          ? null
          : `${API_PREFIX}/${table}/?offset=${totalRows - limit}&limit=${limit}`
      };

      query.limit(limit).offset(offset);

      res.meta.sql.push(query.toString());

      let rows = await query;

      switch (table) {
        case "routines":
          rows = rows.map(routine => {
            return {
              type: "routines",
              id: routine.id,
              attributes: _.omit(routine, ["id", "failed", "total"]),
              meta: _.extend(_.pick(routine, ["failed", "total"]), {
                finished: routine.finished_timestamp !== null
              })
            };
          });
          break;

        case "pings":
          rows = rows.map(ping => {
            return {
              type: "pings",
              id: ping.id,
              attributes: _.omit(ping, ["id", "routine_id", "device_id"]),
              relationships: {
                routine: { data: { type: "routines", id: ping.routine_id } },
                device: { data: { type: "devices", id: ping.device_id } }
              }
            };
          });
          break;

        default:
          rows = rows.map(row => {
            return {
              type: table,
              id: row.id,
              attributes: _.omit(row, ["id"])
            };
          });
          break;
      }

      let relationships = [];

      if (table === "pings" && _.includes([].concat(req.query.include), "device")) {
        let devicesToFetch = _.uniq(rows.map(row => row.relationships.device.data.id));
        let subQuery = knex("devices")
          .whereIn("id", devicesToFetch)
          .select("*");
        res.meta.sql.push(subQuery.toString());

        relationships.push(
          ...(await subQuery.map(row => {
            return {
              type: "devices",
              id: row.id,
              attributes: _.omit(row, "id")
            };
          }))
        );
      }

      if (table === "pings" && _.includes([].concat(req.query.include), "routine")) {
        let routinesToFetch = _.uniq(rows.map(row => row.relationships.routine.data.id));
        let subQuery = knex("routines")
          .whereIn("id", routinesToFetch)
          .select("*");

        res.meta.sql.push(subQuery.toString());
        relationships.push(
          ...(await subQuery.map(row => {
            return {
              type: "routines",
              id: row.id,
              attributes: _.omit(row, "id")
            };
          }))
        );
      }
      let extra = {};

      if (relationships.length > 0) {
        extra.included = relationships;
      }
      return res
        .status(200)
        .json({ data: rows, meta: _.extend(req.meta, res.meta), links, ...extra });
    })
  );
});

// DELETE /devices/:deviceId
api.delete(
  "/devices/:deviceId",
  wrap(async (req, res, next) => {
    let affected = await knex("devices")
      .where("id", req.params.deviceId)
      .delete();

    if (affected === 0) {
      return next(
        new APIError({
          message: `failed to delete the required row(s)`,
          meta: req.meta
        })
      );
    }

    return res.status(200).json({
      meta: { affected }
    });
  })
);

api.patch("/devices/:deviceId", bp.json(), async (req, res, next) => {
  let { body } = req;
  body = _.pick(body || {}, ["address", "descr", "disabled", "name"]);

  if (_.keys(body).length == 0) {
    return next(new APIError({ message: "Empty body", status: 406 }));
  }
  let { device } = req.rows;

  body.address = utils.sanitizeIp(body.address);
  if (body.address === null) {
    return next(
      new APIError({ message: "address is not a valid IPv4 address", status: 422 })
    );
  }

  if (_.has(body, "descr") && !_.isString(body.descr)) {
    return next(
      new APIError({
        message: `description can only be a string`,
        status: 422
      })
    );
  }

  if (_.has(body, "disabled") && !_.isBoolean(body.disabled)) {
    return next(
      new APIError({
        message: "disabled can only be a boolean",
        status: 422
      })
    );
  }

  if (_.has(body, "disabled")) body.disabled = body.disabled ? 1 : 0;

  if (_.eq(body, device)) {
    return next(new APIError({ message: "No change", status: 409 }));
  }

  let changedRows;

  try {
    changedRows = await knex("devices")
      .update(body)
      .where({ id: device.id });
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT" && err.stack.match(/([a-z0-9_]+)$/i)) {
      let failedConstraint = RegExp.$1;
      return next(
        new APIError({
          message: `Constraint error`,
          status: 409,
          meta: { constraint: failedConstraint }
        })
      );
    }

    return next(
      new APIError({
        status: 500,
        message: "Unexpected Error: " + err.message
      })
    );
  }

  if (changedRows === 0) {
    return next(
      new APIError({ message: "failed to update resource", status: 500, meta: req.meta })
    );
  }

  return res.status(200).json({
    data: {
      type: "devices",
      id: device.id,
      attributes: body
    }
  });
});

api.put(
  "/devices",
  bp.json(),
  wrap(async (req, res, next) => {
    let body = req.body;
    if (!_.has(body, "name")) {
      return next(
        new APIError({
          message: "name is missing",
          status: 422
        })
      );
    }

    if (!_.isString(body.name)) {
      return next(
        new APIError({
          message: "name can only be a string",
          status: 422
        })
      );
    }
    if (!_.has(body, "address")) {
      return next(
        new APIError({
          message: "Ip address is missing",
          status: 422
        })
      );
    }

    if (body.id) {
      delete body.id;
    }

    body.address = utils.sanitizeIp(body.address);

    if (body.address === null) {
      return next(
        new APIError({
          message: "address is not a valid IPv4 address",
          status: 422
        })
      );
    }

    if (_.has(body, "descr") && !_.isString(body.descr)) {
      return next(
        new APIError({
          message: "description can only be a string",
          status: 422
        })
      );
    }

    if (!_.has(body, "disabled")) body.disabled = false;

    if (!_.isBoolean(body.disabled)) {
      return next(
        new APIError({
          message: "disabled can only be a boolean",
          status: 422
        })
      );
    }

    body.disabled = body.disabled ? 1 : 0;

    let id;
    try {
      id = await knex("devices")
        .insert(_.pick(body, ["address", "descr", "disabled", "name"]))
        .returning("id");
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT" && err.stack.match(/([a-z0-9_]+)$/i)) {
        let failedConstraint = RegExp.$1;
        if (failedConstraint) {
          return next(
            new APIError({
              message: "Constraint Error",
              status: 409,
              meta: { constraint: failedConstraint }
            })
          );
        }
      }

      return next(
        new APIError({
          status: 500,
          message: "Unexpected Error: " + err.message
        })
      );
    }

    if (id.length === 0) {
      return next(new APIError({ message: "Failed to create resource", status: 500 }));
    }

    let createdId = id[0];

    let device = await knex("devices")
      .select("*")
      .where("id", createdId)
      .first();

    return res.status(201).json({
      data: {
        type: "devices",
        id: createdId,
        attributes: _.omit(device, "id"),
        links: {
          self: `${API_PREFIX}/device/${createdId}`
        }
      }
    });
  })
);

api.get(
  "/routines/:routineId/relationships/pings",
  wrap(async (req, res) => {
    let routine = req.rows.routine;
    let relatedRows = await knex("pings as ping")
      .select(
        "ping.id",
        "ping.rtt",
        "ping.failed",
        "ping.device_id",
        "ping.timestamp",

        "device.name as device_name",
        "device.address as device_address"
      )
      .where({ routine_id: routine.id })
      .innerJoin("devices as device", "device.id", "ping.device_id");

    relatedRows = relatedRows.map(ping => {
      return {
        data: {
          type: "pings",
          id: ping.id,
          attributes: _.omit(ping, ["id", "device_name", "device_address"]),
          relationships: {
            device: {
              data: {
                type: "devices",
                id: ping.device_id,
                attributes: {
                  name: ping.device_name,
                  address: ping.device_address
                }
              }
            }
          }
        }
      };
    });

    return res.json({
      data: {
        type: "routines",
        id: routine.id,
        attributes: _.omit(routine, "id"),
        relationships: {
          pings: {
            data: relatedRows
          }
        },
        meta: {
          failed: relatedRows.filter(ping => ping.data.attributes.failed).length,
          total: relatedRows.length,
          finished: routine.finished_timestamp !== null
        }
      }
    });
  })
);

api.get(
  "/devices/:deviceId/relationships/pings",
  wrap(async (req, res) => {
    let device = req.rows.device;
    let relatedRows = await knex("pings")
      .select("*")
      .where({ device_id: device.id });

    return res.json({
      data: {
        type: "devices",
        id: device.id,
        attributes: _.omit(device, "id"),
        relationships: {
          pings: {
            data: relatedRows.map(ping => {
              return {
                type: "pings",
                id: ping.id,
                attributes: _.omit(ping, "id", "device_id", "routine_id"),
                relationships: {
                  routine: {
                    data: {
                      type: "routines",
                      id: ping.routine_id
                    }
                  }
                }
              };
            })
          }
        }
      }
    });
  })
);

api.use(function(req, res, next) {
  return next(new APIError({ message: "Route not found", status: 400 }));
});
api.use(function(err, req, res, next) {
  console.error(err.stack);
  if (err.name === "APIError") {
    return res.status(err.status).json({
      errors: [{ title: err.message, status: err.status }]
    });
  }
  return res.status(500).json({
    errors: [{ title: err.message, status: 500 }]
  });
});

app.use("/api/v1/", api);

app.use("/static", express.static(path.join(__dirname, "../build/static")));

app.get("*", function(req, res, next) {
  res.sendFile(path.join(__dirname, "../build/index.html"));
});

module.exports = app;
