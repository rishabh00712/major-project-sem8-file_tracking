const express = require("express");
const router  = express.Router();
const pool    = require("../config/db");
const Joi     = require("joi");

// ── Joi schema for docket search ──
const docketSchema = Joi.object({
  docket: Joi.string().trim().min(1).max(50).required().messages({
    "string.empty": "Docket number is required.",
    "string.min":   "Docket number is required.",
    "string.max":   "Invalid docket number.",
    "any.required": "Docket number is required.",
  }),
});

/* ================= GET: DOCKET SEARCH PAGE ================= */
router.get("/view_flow", (req, res) => {
  return res.status(200).render("docket_search", {
    active:    "",
    _isViewer: true,
    error:     null,
  });
});

/* ================= POST: DOCKET SEARCH → REDIRECT TO FILE FLOW ================= */
router.post("/view_flow", async (req, res) => {
  try {
    // ── Joi validation ──
    const { error, value } = docketSchema.validate(req.body);
    if (error) {
      return res.status(400).render("docket_search", {
        active:    "",
        _isViewer: true,
        error:     error.details[0].message,
      });
    }

    const docket = value.docket.trim();

    // Check docket exists in DB
    const check = await pool.query(
      `SELECT 1 FROM file_flow WHERE docket_number = $1 LIMIT 1`,
      [docket]
    );

    if (check.rows.length === 0) {
      return res.status(404).render("docket_search", {
        active:    "",
        _isViewer: true,
        error:     `No records found for docket: ${docket}`,
      });
    }

    return res.redirect(`/file_flow_viewer?docket=${encodeURIComponent(docket)}`);

  } catch (err) {
    console.error("view_flow POST error:", err);
    return res.status(500).render("docket_search", {
      active:    "",
      _isViewer: true,
      error:     "Something went wrong. Please try again.",
    });
  }
});

/* ================= GET: FILE FLOW VIEWER ================= */
router.get("/file_flow_viewer", async (req, res) => {
  try {
    const { docket } = req.query;

    if (!docket) {
      return res.status(400).render("docket_search", {
        active:    "",
        _isViewer: true,
        error:     "Docket number is required.",
      });
    }

    if (docket.length > 50) {
      return res.status(400).render("docket_search", {
        active:    "",
        _isViewer: true,
        error:     "Invalid docket number.",
      });
    }

    const result = await pool.query(
      `SELECT * FROM file_flow
       WHERE docket_number = $1
       ORDER BY id ASC`,
      [docket]
    );

    if (result.rows.length === 0) {
      return res.status(404).render("docket_search", {
        active:    "",
        _isViewer: true,
        error:     `No records found for docket: ${docket}`,
      });
    }

    const fileResult = await pool.query(
      `SELECT complete FROM files
       WHERE docket_number = $1
       LIMIT 1`,
      [docket]
    );

    const complete = fileResult.rows.length > 0
      ? fileResult.rows[0].complete
      : false;

    return res.status(200).render("file_flow", {
      docket_number: docket,
      forms:         result.rows,
      active:        "",
      viewer:        true,
      complete,
    });

  } catch (err) {
    console.error("file_flow_viewer GET error:", err);
    return res.status(500).render("docket_search", {
      active:    "",
      _isViewer: true,
      error:     "Something went wrong. Please try again.",
    });
  }
});

module.exports = router;