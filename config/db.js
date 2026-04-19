// // config/db.js
// require("dotenv").config();

// const { Pool } = require("pg");

// // Create pool (Neon DB connection)
// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: {
//     rejectUnauthorized: false, // required for Neon
//   },
//   idleTimeoutMillis: 30000,      // close idle clients after 30s
//   connectionTimeoutMillis: 15000, // return error after 5s if cannot connect
// });

// // Handle unexpected errors (prevents crash)
// pool.on("error", (err) => {
//   console.error("❌ Unexpected DB error:", err);
// });

// // Optional: test DB connection safely
// (async () => {
//   try {
//     await pool.query("SELECT 1");
//     console.log("✅ Connected to Neon DB");
//   } catch (err) {
//     console.error("❌ DB Connection Error:", err);
//   }
// })();

// module.exports = pool;
// config/db.js
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // required for Neon
  },
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

pool.on("error", (err) => {
  console.error("❌ Unexpected DB error:", err.message);
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Keep trying until the DB becomes available
async function connectWithRetry() {
  let attempt = 0;

  while (true) {
    try {
      await pool.query("SELECT 1");
      console.log("✅ Connected to Neon DB");
      return true;
    } catch (err) {
      attempt += 1;
      console.error(`❌ DB Connection Error (attempt ${attempt}):`, err.message);

      const delay = Math.min(30000, attempt * 2000); // 2s, 4s, 6s... up to 30s
      console.log(`🔁 Retrying in ${delay / 1000} seconds...`);
      await sleep(delay);
    }
  }
}

// Start connecting in the background
const readyPromise = connectWithRetry();

// Make every query wait until the first successful DB connection
const originalQuery = pool.query.bind(pool);
pool.query = async (...args) => {
  await readyPromise;
  return originalQuery(...args);
};

module.exports = pool;