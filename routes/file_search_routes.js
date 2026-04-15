// routes/searchRoutes.js

const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const isAuth = require("./middleware/auth");

const ROWS_PER_PAGE = 10;

// ─────────────────────────────────────────────
// GET /file_search  — paginated file list
// ─────────────────────────────────────────────
router.get("/file_search", isAuth, async (req, res) => {
  try {
    const currentPage = parseInt(req.query.page) || 1;
    const offset = (currentPage - 1) * ROWS_PER_PAGE;

    const countResult = await pool.query("SELECT COUNT(*) FROM files");
    const totalRows = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalRows / ROWS_PER_PAGE);

    const result = await pool.query(
      "SELECT * FROM files ORDER BY date DESC LIMIT $1 OFFSET $2",
      [ROWS_PER_PAGE, offset]
    );

    res.render("file_search", {
      files: result.rows,
      currentPage,
      totalPages,
      active: "file_search",
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching files");
  }
});

// ─────────────────────────────────────────────
// POST /complete_file/:docket  — mark as complete
// ─────────────────────────────────────────────
router.post("/complete_file/:docket", isAuth, async (req, res) => {
  const { docket } = req.params;
  try {
    await pool.query(
      "UPDATE files SET complete = TRUE WHERE docket_number = $1",
      [docket]
    );
    // Redirect back to the same page the user was on (referer), or default
    const referer = req.get("Referer") || "/file_search";
    res.redirect(referer);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error completing file");
  }
});

// ─────────────────────────────────────────────
// POST /reopen_file/:docket  — mark as in-progress
// ─────────────────────────────────────────────
router.post("/reopen_file/:docket", isAuth, async (req, res) => {
  const { docket } = req.params;
  try {
    await pool.query(
      "UPDATE files SET complete = FALSE WHERE docket_number = $1",
      [docket]
    );
    const referer = req.get("Referer") || "/file_search";
    res.redirect(referer);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error reopening file");
  }
});

// ─────────────────────────────────────────────
// POST /delete_file/:docket  — delete single row
// ─────────────────────────────────────────────
router.post("/delete_file/:docket", isAuth, async (req, res) => {
  const { docket } = req.params;
  try {
    await pool.query(
      "DELETE FROM files WHERE docket_number = $1",
      [docket]
    );
    const referer = req.get("Referer") || "/file_search";
    res.redirect(referer);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting file");
  }
});

// ─────────────────────────────────────────────
// POST /delete_page_files  — delete all visible rows on the page
// Body: { dockets: JSON string of docket array }
// ─────────────────────────────────────────────
router.post("/delete_page_files", isAuth, async (req, res) => {
  try {
    // Frontend sends dockets as a JSON-stringified array in a hidden input
    const dockets = JSON.parse(req.body.dockets || "[]");

    if (!Array.isArray(dockets) || dockets.length === 0) {
      return res.status(400).send("No dockets provided");
    }

    // Build  $1, $2, $3 … placeholders dynamically
    const placeholders = dockets.map((_, i) => `$${i + 1}`).join(", ");

    await pool.query(
      `DELETE FROM files WHERE docket_number IN (${placeholders})`,
      dockets
    );

    // After bulk delete go back to page 1 (current page may now be empty)
    res.redirect("/file_search?page=1");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error deleting page files");
  }
});

module.exports = router;