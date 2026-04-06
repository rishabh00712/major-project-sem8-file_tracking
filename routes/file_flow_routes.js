// routes/flowRoutes.js

const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");

// 🔥 Multer setup (temp storage)
const upload = multer({ dest: "uploads/" });

/* ================= GET: FILE FLOW ================= */
router.get("/file_flow", async (req, res) => {
  try {
    const { docket } = req.query;

    console.log("Docket:", docket);

    const result = await pool.query(
      `SELECT * FROM file_flow 
       WHERE docket_number = $1 
       ORDER BY id ASC`,
      [docket]
    );

    return res.render("file_flow", {
      docket_number: docket,
      forms: result.rows,
      active: ""
    });

  } catch (err) {
    console.error(err);
    return res.send("Error loading file flow");
  }
});


/* ================= POST: ADD FLOW ================= */
router.post(
  "/file_flow",
  upload.single("file"),   // 🔥 matches your input name="file"
  async (req, res) => {
    try {
      const { docket } = req.query;

      const {
        file_flow,
        name,
        department,
        date,
        subject
      } = req.body;


     let imageUrl = null;

// 🔥 DEBUG
console.log("FILE RECEIVED:", req.file);

if (req.file && req.file.path) {

  // ✅ Check image type
  if (!req.file.mimetype.startsWith("image/")) {
    fs.unlinkSync(req.file.path);
    return res.send("Only image files are allowed");
  }

  try {
    // 🔥 Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "file_flow_images"
    });

    imageUrl = result.secure_url;

    console.log("UPLOADED URL:", imageUrl);

  } catch (err) {
    console.error("Cloudinary Error:", err);
    return res.send("Image upload failed");
  }

  // 🔥 Delete temp file
  fs.unlinkSync(req.file.path);

} else {
  console.log("⚠️ No file uploaded");
}
        let finalName = "";

        // 🔥 If it's array → pick correct value
        if (Array.isArray(name)) {
        finalName = name.find(n => n && n.trim() !== "");
        }

        // 🔥 If it's object → take key
        else if (typeof name === "object" && name !== null) {
        finalName = Object.keys(name)[0];
        }

        // 🔥 If it's normal string
        else {
        finalName = name;
        }
      // 🔥 4. Insert into DB
      await pool.query(
        `INSERT INTO file_flow 
        (docket_number, flow, name, department, date, subject, image_file)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          docket,
          file_flow,
          finalName,
          department,
          date,
          subject || null,
          imageUrl // can be null
        ]
      );

      // 🔥 5. Redirect back
      return res.redirect(`/file_flow?docket=${docket}`);

    } catch (err) {
      console.error(err);
      return res.send("Error saving file flow");
    }
  }
);

// ================= HOLD =================
router.post("/hold/:id", async (req, res) => {
  try {
    const { docket } = req.query;
    const id = parseInt(req.params.id);

    // 🔥 update hold = true
    await pool.query(
      `UPDATE file_flow
       SET hold = true,
           hold_desc = $1
       WHERE id = $2 AND docket_number = $3`,
      [
        req.body.description || "",
        id,
        docket
      ]
    );

    return res.redirect(`/file_flow?docket=${docket}`);

  } catch (err) {
    console.error(err);
    return res.send("Error applying hold");
  }
});

// ================= CANCEL HOLD =================
router.post("/cancel-hold/:id", async (req, res) => {
  try {
    const { docket } = req.query;
    const id = parseInt(req.params.id);
    
    // 🔥 update hold = false
    await pool.query(
      `UPDATE file_flow
       SET hold = false,
           hold_desc = ''
       WHERE id = $1 AND docket_number = $2`,
      [
        id,
        docket
      ]
    );

    return res.redirect(`/file_flow?docket=${docket}`);

  } catch (err) {
    console.error(err);
    return res.send("Error canceling hold");
  }
});

module.exports = router;