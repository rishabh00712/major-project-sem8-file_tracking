// routes/flowRoutes.js

const express = require("express");
const router  = express.Router();
const pool    = require("../config/db");
const multer  = require("multer");
const cloudinary = require("../config/cloudinary");
const fs      = require("fs");

// 🔥 Multer setup (temp storage)
const upload = multer({ dest: "uploads/" });

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDateOnly() {
  const now    = new Date();
  const day    = String(now.getDate()).padStart(2, "0");
  const month  = String(now.getMonth() + 1).padStart(2, "0");
  const year   = String(now.getFullYear()).slice(2);
  const hour   = String(now.getHours());
  const minute = String(now.getMinutes());
  return `${day}/${month}/${year} - ${hour}:${minute}`;
}

/**
 * Returns a Promise that resolves once the socket room `jobId` has at least
 * one connected client, or rejects after `timeoutMs` milliseconds.
 *
 * The loading page joins the socket room as soon as it loads; we just need
 * to wait for that JOIN before emitting any progress events.
 */
function waitForSocketReady(io, jobId, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    async function check() {
      try {
        const sockets = await io.in(jobId).fetchSockets();
        if (sockets.length > 0) {
          return resolve();
        }
        if (Date.now() >= deadline) {
          return reject(new Error(`Socket for job ${jobId} never connected.`));
        }
        setTimeout(check, 100); // poll every 100 ms
      } catch (err) {
        reject(err);
      }
    }

    check();
  });
}

// ─── GET: FILE FLOW ──────────────────────────────────────────────────────────

router.get("/file_flow", async (req, res) => {
  try {
    const { docket } = req.query;

    const flowResult = await pool.query(
      `SELECT * FROM file_flow
       WHERE docket_number = $1
       ORDER BY id ASC`,
      [docket]
    );

    const fileResult = await pool.query(
      `SELECT complete FROM files
       WHERE docket_number = $1
       LIMIT 1`,
      [docket]
    );

    const complete =
      fileResult.rows.length > 0 ? fileResult.rows[0].complete : false;

    return res.render("file_flow", {
      docket_number: docket,
      forms:         flowResult.rows,
      active:        "",
      complete,
    });
  } catch (err) {
    console.error(err);
    return res.send("Error loading file flow");
  }
});

// ─── POST: ADD FLOW ──────────────────────────────────────────────────────────

router.post("/file_flow", upload.single("file"), async (req, res) => {
  const io         = req.app.get("io");
  const { docket } = req.query;

  const { file_flow, name, department, subject } = req.body;
  const uploadedFile = req.file || null;

  try {
    const jobId = `addflow_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Render the loading page first so the client can open the socket
    res.render("loading_email", { jobId });

    // ── Wait until the client's socket has joined the room ──────────────────
    try {
      await waitForSocketReady(io, jobId);
    } catch (waitErr) {
      console.error("Socket never connected for job:", jobId, waitErr.message);
      // Nothing more we can do — the loading page won't receive events
      return;
    }

    // ── Now run the actual work ──────────────────────────────────────────────
    try {
      // STEP 1: Upload image if provided
      io.to(jobId).emit("job:progress", { jobId, step: "db" });
      await new Promise(r => setTimeout(r, 500));

      let imageUrl = null;

      if (uploadedFile && uploadedFile.path) {
        if (!uploadedFile.mimetype.startsWith("image/")) {
          fs.unlinkSync(uploadedFile.path);
          return io.to(jobId).emit("job:error", {
            jobId,
            message:  "Only image files are allowed.",
            redirect: `/file_flow?docket=${docket}`,
          });
        }

        try {
          const result = await cloudinary.uploader.upload(uploadedFile.path, {
            folder: "file_flow_images",
          });
          imageUrl = result.secure_url;
          console.log("UPLOADED URL:", imageUrl);
        } catch (err) {
          console.error("Cloudinary Error:", err);
          return io.to(jobId).emit("job:error", {
            jobId,
            message:  "Image upload failed. Please try again.",
            redirect: `/file_flow?docket=${docket}`,
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
        [docket, file_flow, finalName, department, formatDateOnly(), subject || null, imageUrl]
      );

      // STEP 4: Finalizing
      io.to(jobId).emit("job:progress", { jobId, step: "email" });
      await new Promise(r => setTimeout(r, 400));

      io.to(jobId).emit("job:done", {
        jobId,
        redirect: `/file_flow?docket=${docket}`,
      });
    } catch (err) {
      console.error("Add flow async error:", err);
      io.to(jobId).emit("job:error", {
        jobId,
        message:  "Something went wrong saving flow.",
        redirect: `/file_flow?docket=${docket}`,
      });
    }
  } catch (err) {
    console.error(err);
    res.send("Error saving file flow");
  }
});

// ─── POST: HOLD ──────────────────────────────────────────────────────────────

router.post("/hold/:id", async (req, res) => {
  const io          = req.app.get("io");
  const { docket }  = req.query;
  const id          = parseInt(req.params.id);
  const description = req.body.description || "";

  try {
    const jobId = `hold_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    res.render("loading_email", { jobId });

    try {
      await waitForSocketReady(io, jobId);
    } catch (waitErr) {
      console.error("Socket never connected for job:", jobId, waitErr.message);
      return;
    }

    try {
      // STEP 1: Finding record
      io.to(jobId).emit("job:progress", { jobId, step: "db" });
      await new Promise(r => setTimeout(r, 500));

      // STEP 2: Applying hold
      io.to(jobId).emit("job:progress", { jobId, step: "encrypt" });
      await new Promise(r => setTimeout(r, 500));

      await pool.query(
        `UPDATE file_flow
         SET hold      = true,
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

      io.to(jobId).emit("job:done", {
        jobId,
        redirect: `/file_flow?docket=${docket}`,
      });
    } catch (err) {
      console.error("Hold async error:", err);
      io.to(jobId).emit("job:error", {
        jobId,
        message:  "Something went wrong applying hold.",
        redirect: `/file_flow?docket=${docket}`,
      });
    }
  } catch (err) {
    console.error(err);
    res.send("Error applying hold");
  }
});

// ─── POST: CANCEL HOLD ───────────────────────────────────────────────────────

router.post("/cancel-hold/:id", async (req, res) => {
  const io         = req.app.get("io");
  const { docket } = req.query;
  const id         = parseInt(req.params.id);

  try {
    const jobId = `cancelhold_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    res.render("loading_email", { jobId });

    try {
      await waitForSocketReady(io, jobId);
    } catch (waitErr) {
      console.error("Socket never connected for job:", jobId, waitErr.message);
      return;
    }

    try {
      // STEP 1: Finding record
      io.to(jobId).emit("job:progress", { jobId, step: "db" });
      await new Promise(r => setTimeout(r, 500));

      // STEP 2: Removing hold
      io.to(jobId).emit("job:progress", { jobId, step: "encrypt" });
      await new Promise(r => setTimeout(r, 500));

      await pool.query(
        `UPDATE file_flow
         SET hold      = false,
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

      io.to(jobId).emit("job:done", {
        jobId,
        redirect: `/file_flow?docket=${docket}`,
      });
    } catch (err) {
      console.error("Cancel hold async error:", err);
      io.to(jobId).emit("job:error", {
        jobId,
        message:  "Something went wrong canceling hold.",
        redirect: `/file_flow?docket=${docket}`,
      });
    }
  } catch (err) {
    console.error(err);
    res.send("Error canceling hold");
  }
});

// ─── POST: DELETE FLOW ENTRY (socket-powered) ────────────────────────────────
router.post("/delete_file_flow/:id", async (req, res) => {
  const io         = req.app.get("io");
  const { id }     = req.params;
  const { docket } = req.query;

  try {
    const jobId = `deleteflow_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    res.render("loading_email", { jobId, mode: "delete" }); // 👈 only change

    try {
      await waitForSocketReady(io, jobId);
    } catch (waitErr) {
      console.error("Socket never connected for job:", jobId, waitErr.message);
      return;
    }

    try {
      // STEP 1: Finding record
      io.to(jobId).emit("job:progress", { jobId, step: "db" });
      await new Promise(r => setTimeout(r, 500));

      // STEP 2: Deleting record
      io.to(jobId).emit("job:progress", { jobId, step: "encrypt" });
      await new Promise(r => setTimeout(r, 500));

      await pool.query(
        "DELETE FROM file_flow WHERE id = $1 AND docket_number = $2",
        [id, docket]
      );

      // STEP 3: Saving changes
      io.to(jobId).emit("job:progress", { jobId, step: "flow" });
      await new Promise(r => setTimeout(r, 500));

      // STEP 4: Finalizing
      io.to(jobId).emit("job:progress", { jobId, step: "email" });
      await new Promise(r => setTimeout(r, 400));

      io.to(jobId).emit("job:done", {
        jobId,
        redirect: `/file_flow?docket=${docket}`,
      });
    } catch (err) {
      console.error("Delete flow async error:", err);
      io.to(jobId).emit("job:error", {
        jobId,
        message:  "Something went wrong deleting the entry.",
        redirect: `/file_flow?docket=${docket}`,
      });
    }
  } catch (err) {
    console.error("Delete flow outer error:", err);
    res.status(500).send("Error deleting flow entry");
  }
});
module.exports = router;