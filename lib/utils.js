const { isIPv4 } = require("net");
const _ = require("lodash");

exports.parseQuery = (query, name, parse, validator, defaultVal) => {
  if (!_.has(query, name)) return defaultVal;

  let value = parse(query[name]);

  if (!validator(value)) return defaultVal;

  return value;
};

exports.booleanParser = v => {
  switch ((v || "").trim().toLowerCase()) {
    case "y":
    case "1":
    case "yep":
    case "true":
    case "yes":
      return true;

    case "false":
    case "n":
    case "0":
    case "nop":
    case "nope":
    case "no":
      return false;
  }
  return null;
};

exports.wrap = function(fn) {
  if (fn.constructor.name === "AsyncFunction") {
    return function(req, res, next) {
      let nextCalled = false;
      let nextOverride = function(err) {
        if (nextCalled) return false;
        nextCalled = true;

        if (err) {
          return next(err);
        }
        next();
      };
      return Promise.resolve()
        .then(() => fn(req, res, nextOverride))

        .catch(err => {
          nextOverride(err);
        });
    };
  }
  return fn;
};

exports.sanitizeIp = v => {
  if (!isIPv4(v)) return null;

  return v
    .split(".")
    .map(v => _.parseInt(v))
    .join(".");
};
