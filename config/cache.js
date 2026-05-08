const { Redis } = require("@upstash/redis");

let redis = null;

try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log("✅ Redis connected");
  } else {
    console.warn("⚠️ Redis env vars missing — caching disabled, using DB only");
  }
} catch (err) {
  console.error("❌ Redis init failed:", err.message, "— falling back to DB");
  redis = null;
}

const CACHE_TTL    = 60 * 5;
const CACHE_PREFIX = "file_search:page:";
const LOCK_TTL     = 30; // seconds — auto-expires if server crashes mid-delete

// ── Lock key helper ────────────────────────────────────────
function docketLockKey(docket) {
  return `lock:delete:docket:${docket}`;
}

// ── Acquire mutex lock (returns true if acquired, false if already locked) ──
// Falls back to true (allow) if Redis is unavailable — so app never breaks
async function acquireLock(docket) {
  if (!redis) return true; // ← Redis down, allow operation silently
  try {
    const key    = docketLockKey(docket);
    const result = await redis.set(key, "1", { nx: true, ex: LOCK_TTL });
    return result === "OK";
  } catch (err) {
    console.error("❌ acquireLock error — allowing operation:", err.message);
    return true; // ← never block the user if Redis fails
  }
}

// ── Release mutex lock ─────────────────────────────────────
async function releaseLock(docket) {
  if (!redis) return;
  try {
    await redis.del(docketLockKey(docket));
  } catch (err) {
    console.error("❌ releaseLock error:", err.message);
    // don't throw — lock will auto-expire via TTL anyway
  }
}

// ── Acquire locks for multiple dockets atomically ──────────
// Returns { success: true } or { success: false, blockedBy: docket }
async function acquireMultipleLocks(dockets) {
  const acquired = [];
  for (const docket of dockets) {
    const ok = await acquireLock(docket);
    if (!ok) {
      // Roll back all locks acquired so far
      for (const d of acquired) await releaseLock(d);
      return { success: false, blockedBy: docket };
    }
    acquired.push(docket);
  }
  return { success: true };
}

// ── Release locks for multiple dockets ────────────────────
async function releaseMultipleLocks(dockets) {
  await Promise.all(dockets.map(d => releaseLock(d)));
}

// ─────────────────────────────────────────────────────────
// Cache helpers (unchanged)
// ─────────────────────────────────────────────────────────
async function getCache(key) {
  if (!redis) return null;
  try {
    const data = await redis.get(key);
    if (!data) return null;
    return typeof data === "string" ? JSON.parse(data) : data;
  } catch (err) {
    console.error("❌ Cache GET error — falling back to DB:", err.message);
    return null;
  }
}

async function setCache(key, value) {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), { ex: CACHE_TTL });
    console.log(`✅ Cache SET: ${key} (TTL ${CACHE_TTL}s)`);
  } catch (err) {
    console.error("❌ Cache SET error — data saved to DB only:", err.message);
  }
}

async function clearSearchCache() {
  if (!redis) return;
  try {
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
    if (keys && keys.length > 0) {
      await Promise.all(keys.map(k => redis.del(k)));
      console.log(`🧹 Cache cleared: ${keys.length} key(s) removed`);
    }
  } catch (err) {
    console.error("❌ Cache clear error — DB will still be updated:", err.message);
  }
}

module.exports = {
  redis,
  CACHE_TTL,
  CACHE_PREFIX,
  getCache,
  setCache,
  clearSearchCache,
  acquireLock,
  releaseLock,
  acquireMultipleLocks,
  releaseMultipleLocks,
};