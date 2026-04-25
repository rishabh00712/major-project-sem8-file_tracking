// config/db.js
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
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

// Save original BEFORE overriding
const originalQuery = pool.query.bind(pool);

async function connectWithRetry() {
  let attempt = 0;

  while (true) {
    try {
      await originalQuery("SELECT 1"); // ✅ Use original, not overridden
      console.log("✅ Connected to Neon DB");
      return true;
    } catch (err) {
      attempt += 1;
      console.error(`❌ DB Connection Error (attempt ${attempt}):`, err.message);

      const delay = Math.min(30000, attempt * 2000);
      console.log(`🔁 Retrying in ${delay / 1000} seconds...`);
      await sleep(delay);
    }
  }
}

const readyPromise = connectWithRetry();

// All external queries wait for the first successful connection
pool.query = async (...args) => {
  await readyPromise;
  return originalQuery(...args);
};

module.exports = pool;