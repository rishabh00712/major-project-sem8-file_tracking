const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const pool = require("./db");

const sessionMiddleware = session({
  store: new pgSession({
    pool: pool,
    tableName: "session",
    createTableIfMissing: true // ✅ ADD THIS
  }),
  secret: "mysecretkey",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
});

module.exports = sessionMiddleware;