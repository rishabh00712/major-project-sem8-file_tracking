// routes/searchRoutes.js

const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const isAuth = require("./middleware/auth");

const ROWS_PER_PAGE = 20;

// ✅ GET file search page (default: page 1)
router.get("/file_search", isAuth, async (req, res) => {
  try {
    const currentPage = parseInt(req.query.page) || 1;
    const offset = (currentPage - 1) * ROWS_PER_PAGE;

    // Get total row count
    const countResult = await pool.query("SELECT COUNT(*) FROM files");
    const totalRows = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalRows / ROWS_PER_PAGE);

    // Fetch only the rows for this page
    const result = await pool.query(
      "SELECT * FROM files ORDER BY date DESC LIMIT $1 OFFSET $2",
      [ROWS_PER_PAGE, offset]
    );

    res.render("file_search", {
      files: result.rows,
      currentPage,
      totalPages,
      active: "file_search"
    });

  } catch (err) {
    console.error(err);
    res.send("Error fetching files");
  }
});

module.exports = router;