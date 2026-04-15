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

    // 1️⃣ Get file_flow data
    const flowResult = await pool.query(
      `SELECT * FROM file_flow 
       WHERE docket_number = $1 
       ORDER BY id ASC`,
      [docket]
    );

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

    // 4️⃣ Render with complete
    return res.render("file_flow", {
      docket_number: docket,
      forms: flowResult.rows,
      active: "",
      complete: complete   // 👈 added this
    });

  } catch (err) {
    console.error(err);
    return res.send("Error loading file flow");
  }
});


/* ================= POST: ADD FLOW ================= */
router.post(
  "/file_flow",
  upload.single("file"),
  async (req, res) => {
    const io         = req.app.get("io");
    const { docket } = req.query;

    // ── Capture all body fields before setTimeout ──
    const { file_flow, name, department, date, subject } = req.body;

    // ── Capture file before setTimeout ──
    const uploadedFile = req.file || null;

    try {
      const jobId = `addflow_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      res.render("loading_email", { jobId });

      setTimeout(async () => {
        try {

          // STEP 1: Upload image if exists
          io.to(jobId).emit("job:progress", { jobId, step: "db" });
          await new Promise(r => setTimeout(r, 500));

          let imageUrl = null;

          if (uploadedFile && uploadedFile.path) {

            if (!uploadedFile.mimetype.startsWith("image/")) {
              fs.unlinkSync(uploadedFile.path);
              return io.to(jobId).emit("job:error", {
                jobId,
                message: "Only image files are allowed.",
                redirect: `/file_flow?docket=${docket}`
              });
            }

            try {
              const result = await cloudinary.uploader.upload(uploadedFile.path, {
                folder: "file_flow_images"
              });
              imageUrl = result.secure_url;
              console.log("UPLOADED URL:", imageUrl);
            } catch (err) {
              console.error("Cloudinary Error:", err);
              return io.to(jobId).emit("job:error", {
                jobId,
                message: "Image upload failed. Please try again.",
                redirect: `/file_flow?docket=${docket}`
              });
            }

            fs.unlinkSync(uploadedFile.path);

          } else {
            console.log("⚠️ No file uploaded");
          }

          // STEP 2: Encrypting data
          io.to(jobId).emit("job:progress", { jobId, step: "encrypt" });
          await new Promise(r => setTimeout(r, 500));

          let finalName = "";
          if (Array.isArray(name)) {
            finalName = name.find(n => n && n.trim() !== "");
          } else if (typeof name === "object" && name !== null) {
            finalName = Object.keys(name)[0];
          } else {
            finalName = name;
          }

          // STEP 3: Save to DB
          io.to(jobId).emit("job:progress", { jobId, step: "flow" });
          await new Promise(r => setTimeout(r, 500));

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
              imageUrl
            ]
          );

          // STEP 4: Finalizing
          io.to(jobId).emit("job:progress", { jobId, step: "email" });
          await new Promise(r => setTimeout(r, 400));

          // ── DONE ──
          io.to(jobId).emit("job:done", {
            jobId,
            redirect: `/file_flow?docket=${docket}`
          });

        } catch (err) {
          console.error("Add flow async error:", err);
          io.to(jobId).emit("job:error", {
            jobId,
            message: "Something went wrong saving flow.",
            redirect: `/file_flow?docket=${docket}`
          });
        }
      }, 1200);

    } catch (err) {
      console.error(err);
      res.send("Error saving file flow");
    }
  }
);

/* ================= POST: HOLD ================= */
router.post("/hold/:id", async (req, res) => {
  const io          = req.app.get("io");
  const { docket }  = req.query;
  const id          = parseInt(req.params.id);
  const description = req.body.description || "";

  try {
    const jobId = `hold_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    res.render("loading_email", { jobId });

    setTimeout(async () => {
      try {

        // STEP 1: Finding record
        io.to(jobId).emit("job:progress", { jobId, step: "db" });
        await new Promise(r => setTimeout(r, 500));

        // STEP 2: Applying hold
        io.to(jobId).emit("job:progress", { jobId, step: "encrypt" });
        await new Promise(r => setTimeout(r, 500));

        await pool.query(
          `UPDATE file_flow
           SET hold = true,
               hold_desc = $1
           WHERE id = $2 AND docket_number = $3`,
          [description, id, docket]
        );

        // STEP 3: Saving record
        io.to(jobId).emit("job:progress", { jobId, step: "flow" });
        await new Promise(r => setTimeout(r, 500));

        // STEP 4: Finalizing
        io.to(jobId).emit("job:progress", { jobId, step: "email" });
        await new Promise(r => setTimeout(r, 400));

        // ── DONE ──
        io.to(jobId).emit("job:done", {
          jobId,
          redirect: `/file_flow?docket=${docket}`
        });

      } catch (err) {
        console.error("Hold async error:", err);
        io.to(jobId).emit("job:error", {
          jobId,
          message: "Something went wrong applying hold.",
          redirect: `/file_flow?docket=${docket}`
        });
      }
    }, 1200);

  } catch (err) {
    console.error(err);
    res.send("Error applying hold");
  }
});

/* ================= POST: CANCEL HOLD ================= */
router.post("/cancel-hold/:id", async (req, res) => {
  const io         = req.app.get("io");
  const { docket } = req.query;
  const id         = parseInt(req.params.id);

  try {
    const jobId = `cancelhold_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    res.render("loading_email", { jobId });

    setTimeout(async () => {
      try {

        // STEP 1: Finding record
        io.to(jobId).emit("job:progress", { jobId, step: "db" });
        await new Promise(r => setTimeout(r, 500));

        // STEP 2: Removing hold
        io.to(jobId).emit("job:progress", { jobId, step: "encrypt" });
        await new Promise(r => setTimeout(r, 500));

        await pool.query(
          `UPDATE file_flow
           SET hold = false,
               hold_desc = ''
           WHERE id = $1 AND docket_number = $2`,
          [id, docket]
        );

        // STEP 3: Saving record
        io.to(jobId).emit("job:progress", { jobId, step: "flow" });
        await new Promise(r => setTimeout(r, 500));

        // STEP 4: Finalizing
        io.to(jobId).emit("job:progress", { jobId, step: "email" });
        await new Promise(r => setTimeout(r, 400));

        // ── DONE ──
        io.to(jobId).emit("job:done", {
          jobId,
          redirect: `/file_flow?docket=${docket}`
        });

      } catch (err) {
        console.error("Cancel hold async error:", err);
        io.to(jobId).emit("job:error", {
          jobId,
          message: "Something went wrong canceling hold.",
          redirect: `/file_flow?docket=${docket}`
        });
      }
    }, 1200);

  } catch (err) {
    console.error(err);
    res.send("Error canceling hold");
  }
});

router.post('/delete_file_flow/:id', async (req, res) => {
  const { id } = req.params;
  const { docket } = req.query; // docket_number passed as query param

  try {
    await pool.query(
      'DELETE FROM file_flow WHERE id = $1 AND docket_number = $2',
      [id, docket]
    );

    res.redirect('/file_flow?docket=' + docket);
  } catch (err) {
    console.error('Error deleting file_flow row:', err);
    res.status(500).send('Error deleting flow entry');
  }
});


module.exports = router;