// routes/searchRoutes.js

const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const isAuth = require("./middleware/auth"); // ✅ import middleware

// ✅ GET all files (protected)
router.get("/file_search", isAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM files ORDER BY docket_number DESC"
    );

    res.render("file_search", {
      files: result.rows,
      active: "file_search"
    });

  } catch (err) {
    console.error(err);
    res.send("Error fetching files");
  }
});

module.exports = router;