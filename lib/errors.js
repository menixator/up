exports.APIError = class APIError extends Error {
  get name() {
    return "APIError";
  }
  constructor({ message, status = 500, meta = {} }) {
    super(message);
    Error.captureStackTrace(this);
    this.status = status;
    this.meta = meta;
  }
};
