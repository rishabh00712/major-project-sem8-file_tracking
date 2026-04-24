const express = require("express");
const router  = express.Router();
const pool    = require("../config/db");
const isAuth  = require("./middleware/auth");
const { getCache, setCache, clearSearchCache, CACHE_PREFIX } = require("../config/cache");
const { google } = require("googleapis");
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
// Google Sheets Auth Helper
// ─────────────────────────────────────────────
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// ─────────────────────────────────────────────
// Append rows to a specific sheet tab
// ─────────────────────────────────────────────
async function appendToSheet(sheets, spreadsheetId, sheetName, rows) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

// ─────────────────────────────────────────────
// Google Sheets Auth Helper
// ─────────────────────────────────────────────
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// ─────────────────────────────────────────────
// Append rows to a specific sheet tab
// ─────────────────────────────────────────────
async function appendToSheet(sheets, spreadsheetId, sheetName, rows) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

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

    // 1. Fetch files data before deleting
    const filesResult = await pool.query(
      `SELECT * FROM files WHERE docket_number IN (${placeholders})`,
      dockets
    );

    // 2. Fetch file_flow data before deleting
    const fileFlowResult = await pool.query(
      `SELECT * FROM file_flow WHERE docket_number IN (${placeholders})`,
      dockets
    );

    // 3. Delete from DB (file_flow rows auto-delete via CASCADE)
    await pool.query(
      `DELETE FROM files WHERE docket_number IN (${placeholders})`,
      dockets
    );

    // 4. Write to Google Sheets
    const sheets = await getSheetsClient();

    if (filesResult.rows.length > 0) {
      const fileRows = filesResult.rows.map((r) => [
        r.docket_number,
        r.subject,
        r.date,
        r.project_code,
        r.description,
        r.pay_amount,
        r.payable_name,
        r.department,
        r.pi_name,
        r.email,
        r.complete,
      ]);
      await appendToSheet(sheets, process.env.GOOGLE_SHEET_ID_files, "files", fileRows);
    }

    if (fileFlowResult.rows.length > 0) {
      const flowRows = fileFlowResult.rows.map((r) => [
        r.id,
        r.docket_number,
        r.flow,
        r.name,
        r.department,
        r.date,
        r.subject,
        r.hold,
        r.hold_desc,
        r.image_file,
      ]);
      await appendToSheet(sheets, process.env.GOOGLE_SHEET_ID_file_flows, "file_flow", flowRows);
    }

    await clearSearchCache();
    res.redirect("/file_search?page=1");
  } catch (err) {
    console.error(err);
    res.redirect(`/file_search?error=${encodeURIComponent("Failed to delete files. Please try again.")}`);
  }
});

// ─────────────────────────────────────────────
// POST /delete_file/:docket — delete single row
// ─────────────────────────────────────────────
router.post("/delete_file/:docket", isAuth, async (req, res) => {
  const { docket } = req.params;
  try {
    // 1. Fetch files data before deleting
    const filesResult = await pool.query(
      "SELECT * FROM files WHERE docket_number = $1",
      [docket]
    );

    // 2. Fetch file_flow data before deleting
    const fileFlowResult = await pool.query(
      "SELECT * FROM file_flow WHERE docket_number = $1",
      [docket]
    );

    // 3. Delete from DB (file_flow rows auto-delete via CASCADE)
    await pool.query(
      "DELETE FROM files WHERE docket_number = $1",
      [docket]
    );

    // 4. Write to Google Sheets
    const sheets = await getSheetsClient();

    if (filesResult.rows.length > 0) {
      const fileRows = filesResult.rows.map((r) => [
        r.docket_number,
        r.subject,
        r.date,
        r.project_code,
        r.description,
        r.pay_amount,
        r.payable_name,
        r.department,
        r.pi_name,
        r.email,
        r.complete,
      ]);
      await appendToSheet(sheets, process.env.GOOGLE_SHEET_ID_files, "files", fileRows);
    }

    if (fileFlowResult.rows.length > 0) {
      const flowRows = fileFlowResult.rows.map((r) => [
        r.id,
        r.docket_number,
        r.flow,
        r.name,
        r.department,
        r.date,
        r.subject,
        r.hold,
        r.hold_desc,
        r.image_file,
      ]);
      await appendToSheet(sheets, process.env.GOOGLE_SHEET_ID_file_flows, "file_flow", flowRows);
    }

    await clearSearchCache();
    res.redirect(req.get("Referer") || "/file_search");
  } catch (err) {
    console.error(err);
    const referer = req.get("Referer") || "/file_search";
    const base = referer.split("?")[0];
    res.redirect(`${base}?error=${encodeURIComponent("Failed to delete file. Please try again.")}`);
  }
});
module.exports = router;
module.exports.clearSearchCache = clearSearchCache;