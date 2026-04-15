// routes/flowRoutes.js

const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");

/* ================= GET: DOCKET SEARCH PAGE ================= */
router.get("/view_flow", (req, res) => {
  return res.render("docket_search", { active: "" });
});

/* ================= POST: DOCKET SEARCH → REDIRECT TO FILE FLOW ================= */
router.post("/view_flow", async (req, res) => {
  try {
    const { docket } = req.body;

    if (!docket || !docket.trim()) {
      return res.render("docket_search", {
        active: "",
        error: "Docket number is required."
      });
    }

    // Check docket exists
    const check = await pool.query(
      `SELECT 1 FROM file_flow WHERE docket_number = $1 LIMIT 1`,
      [docket.trim()]
    );

    if (check.rows.length === 0) {
      return res.render("docket_search", {
        active: "",
        error: `No records found for docket: ${docket.trim()}`
      });
    }

    return res.redirect(`/file_flow_viewer?docket=${encodeURIComponent(docket.trim())}`);

  } catch (err) {
    console.error(err);
    return res.render("docket_search", {
      active: "",
      error: "Something went wrong. Please try again."
    });
  }
});

/* ================= GET: FILE FLOW VIEWER (viewer = true) ================= */
router.get("/file_flow_viewer", async (req, res) => {
  try {
    const { docket } = req.query;

    if (!docket) {
      return res.redirect("/view_flow");
    }

    const result = await pool.query(
      `SELECT * FROM file_flow
       WHERE docket_number = $1
       ORDER BY id ASC`,
      [docket]
    );

    if (result.rows.length === 0) {
      return res.render("docket_search", {
        active: "",
        error: `No records found for docket: ${docket}`
      });
    }
    
    // 2️⃣ Get complete status from files table
    const fileResult = await pool.query(
      `SELECT complete FROM files 
       WHERE docket_number = $1 
       LIMIT 1`,
      [docket]
    );

    // 3️⃣ Extract complete value
    const complete = fileResult.rows.length > 0 
      ? fileResult.rows[0].complete 
      : false;

    return res.render("file_flow", {
      docket_number: docket,
      forms: result.rows,
      active: "",
      viewer: true,
      complete:complete
    });

  } catch (err) {
    console.error(err);
    return res.redirect("/view_flow");
  }
});

module.exports = router;