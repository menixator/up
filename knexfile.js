// Update with your config settings.

module.exports = {
  development: {
    client: "sqlite3",
    connection: {
      filename: "./db/dev.db"
    },
    useNullAsDefault: true,
    pool: {
      afterCreate(conn, cb) {
        conn.run("PRAGMA foreign_keys = ON", cb);
      }
    }
  },

  staging: {
    client: "sqlite3",
    connection: {
      filename: "./db/staging.db"
    },
    useNullAsDefault: true,
    pool: {
      afterCreate(conn, cb) {
        conn.run("PRAGMA foreign_keys = ON", cb);
      }
    }
  },

  production: {
    client: "sqlite3",
    connection: {
      filename: "./db/prod.db"
    },
    useNullAsDefault: true,
    pool: {
      afterCreate(conn, cb) {
        conn.run("PRAGMA foreign_keys = ON", cb);
      }
    }
  }
};
