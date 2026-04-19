const { Redis } = require("@upstash/redis");

let redis = null;

// ── Safe Redis init — if env vars missing, redis stays null ──
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

async function getCache(key) {
  if (!redis) return null; // ← Redis unavailable, skip silently
  try {
    const data = await redis.get(key);
    if (!data) return null;
    return typeof data === "string" ? JSON.parse(data) : data;
  } catch (err) {
    console.error("❌ Cache GET error — falling back to DB:", err.message);
    return null; // ← always fall through to DB
  }
}

async function setCache(key, value) {
  if (!redis) return; // ← skip silently
  try {
    await redis.set(key, JSON.stringify(value), { ex: CACHE_TTL });
    console.log(`✅ Cache SET: ${key} (TTL ${CACHE_TTL}s)`);
  } catch (err) {
    console.error("❌ Cache SET error — data saved to DB only:", err.message);
    // don't throw — app continues normally
  }
}

async function clearSearchCache() {
  if (!redis) return; // ← skip silently
  try {
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
    if (keys && keys.length > 0) {
      await Promise.all(keys.map(k => redis.del(k)));
      console.log(`🧹 Cache cleared: ${keys.length} key(s) removed`);
    }
  } catch (err) {
    console.error("❌ Cache clear error — DB will still be updated:", err.message);
    // don't throw — DB operation already completed before this was called
  }
}

module.exports = {
  redis,
  CACHE_TTL,
  CACHE_PREFIX,
  getCache,
  setCache,
  clearSearchCache,
};