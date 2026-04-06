// config/db.js

require("dotenv").config();

const { Pool } = require("pg");

// Create pool (Neon DB connection)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // required for Neon
  },
  idleTimeoutMillis: 30000,      // close idle clients after 30s
  connectionTimeoutMillis: 15000, // return error after 5s if cannot connect
});

// Handle unexpected errors (prevents crash)
pool.on("error", (err) => {
  console.error("❌ Unexpected DB error:", err);
});

// Optional: test DB connection safely
(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Connected to Neon DB");
  } catch (err) {
    console.error("❌ DB Connection Error:", err);
  }
})();

module.exports = pool;