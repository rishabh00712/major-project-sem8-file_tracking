const express = require("express");
const router  = express.Router();
const pool    = require("../config/db");
const isAuth  = require("./middleware/auth");
const { getCache, setCache, clearSearchCache, CACHE_PREFIX } = require("../config/cache");

const ROWS_PER_PAGE = 10;

// ─────────────────────────────────────────────
// GET /file_search — paginated file list (cached)
// ─────────────────────────────────────────────
router.get("/file_search", isAuth, async (req, res) => {
  try {
    const currentPage = parseInt(req.query.page) || 1;
    const cacheKey    = `${CACHE_PREFIX}${currentPage}`;

    // ── Pick up any error from query string ──
    const error = req.query.error ? decodeURIComponent(req.query.error) : null;

    // ── Check cache ──
    const cached = await getCache(cacheKey);
    if (cached) {
      console.log(`⚡ Cache HIT: page ${currentPage}`);
      return res.render("file_search", {
        files:       cached.files,
        currentPage: cached.currentPage,
        totalPages:  cached.totalPages,
        active:      "file_search",
        error,
      });
    }

    console.log(`🔍 Cache MISS: page ${currentPage} — querying DB`);

    // ── Cache miss: query DB ──
    const offset = (currentPage - 1) * ROWS_PER_PAGE;

    const [countResult, result] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM files"),
      pool.query(
        "SELECT * FROM files ORDER BY date DESC LIMIT $1 OFFSET $2",
        [ROWS_PER_PAGE, offset]
      ),
    ]);

    const totalRows  = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalRows / ROWS_PER_PAGE);

    // ── Store in cache ──
    await setCache(cacheKey, { files: result.rows, currentPage, totalPages });

    return res.render("file_search", {
      files:      result.rows,
      currentPage,
      totalPages,
      active:     "file_search",
      error,
    });

  } catch (err) {
    console.error(err);
    res.redirect(`/file_search?error=${encodeURIComponent("Failed to load files. Please try again.")}`);
  }
});

// ─────────────────────────────────────────────
// POST /complete_file/:docket — mark as complete
// ─────────────────────────────────────────────
router.post("/complete_file/:docket", isAuth, async (req, res) => {
  const { docket } = req.params;
  try {
    await pool.query(
      "UPDATE files SET complete = TRUE WHERE docket_number = $1",
      [docket]
    );
    await clearSearchCache();
    res.redirect(req.get("Referer") || "/file_search");
  } catch (err) {
    console.error(err);
    const referer = req.get("Referer") || "/file_search";
    const base    = referer.split("?")[0];
    res.redirect(`${base}?error=${encodeURIComponent("Failed to complete file. Please try again.")}`);
  }
});

// ─────────────────────────────────────────────
// POST /reopen_file/:docket — mark as in-progress
// ─────────────────────────────────────────────
router.post("/reopen_file/:docket", isAuth, async (req, res) => {
  const { docket } = req.params;
  try {
    await pool.query(
      "UPDATE files SET complete = FALSE WHERE docket_number = $1",
      [docket]
    );
    await clearSearchCache();
    res.redirect(req.get("Referer") || "/file_search");
  } catch (err) {
    console.error(err);
    const referer = req.get("Referer") || "/file_search";
    const base    = referer.split("?")[0];
    res.redirect(`${base}?error=${encodeURIComponent("Failed to reopen file. Please try again.")}`);
  }
});

// ─────────────────────────────────────────────
// POST /delete_file/:docket — delete single row
// ─────────────────────────────────────────────
router.post("/delete_file/:docket", isAuth, async (req, res) => {
  const { docket } = req.params;
  try {
    await pool.query(
      "DELETE FROM files WHERE docket_number = $1",
      [docket]
    );
    await clearSearchCache();
    res.redirect(req.get("Referer") || "/file_search");
  } catch (err) {
    console.error(err);
    const referer = req.get("Referer") || "/file_search";
    const base    = referer.split("?")[0];
    res.redirect(`${base}?error=${encodeURIComponent("Failed to delete file. Please try again.")}`);
  }
});

// ─────────────────────────────────────────────
// POST /delete_page_files — delete all rows on current page
// ─────────────────────────────────────────────
router.post("/delete_page_files", isAuth, async (req, res) => {
  try {
    const dockets = JSON.parse(req.body.dockets || "[]");

    if (!Array.isArray(dockets) || dockets.length === 0) {
      return res.redirect(`/file_search?error=${encodeURIComponent("No dockets provided.")}`);
    }

    const placeholders = dockets.map((_, i) => `$${i + 1}`).join(", ");
    await pool.query(
      `DELETE FROM files WHERE docket_number IN (${placeholders})`,
      dockets
    );

    await clearSearchCache();
    res.redirect("/file_search?page=1");
  } catch (err) {
    console.error(err);
    res.redirect(`/file_search?error=${encodeURIComponent("Failed to delete files. Please try again.")}`);
  }
});

module.exports = router;
module.exports.clearSearchCache = clearSearchCache;