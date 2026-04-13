const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const db = require("../config/db");

// ✅ GET: root redirect
router.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/file_add");
  res.render("sign_in");
});

// ✅ GET: signin page
router.get("/signin", (req, res) => {
  if (req.session.user) return res.redirect("/file_add");
  res.render("sign_in");
});

// ✅ POST: signin with socket loading
router.post("/signin", async (req, res) => {
  const { email, password } = req.body;
  const io = req.app.get("io");

  try {
    const jobId = `signin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // ── Render loading screen immediately ──
    res.render("loading_email", { jobId });

    setTimeout(async () => {
      try {

        // STEP 1: Check DB for user
        io.to(jobId).emit("job:progress", { jobId, step: "db" });

        const result = await db.query(
          "SELECT * FROM store_emails WHERE email = $1",
          [email]
        );

        if (result.rows.length === 0) {
          return io.to(jobId).emit("job:error", {
            jobId,
            message: "Email not registered.",
            redirect: "/signin"
          });
        }

        // STEP 2: Verify & decrypt password
        io.to(jobId).emit("job:progress", { jobId, step: "encrypt" });

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
          return io.to(jobId).emit("job:error", {
            jobId,
            message: "Incorrect password.",
            redirect: "/signin"
          });
        }

        // STEP 3: Create session
        io.to(jobId).emit("job:progress", { jobId, step: "flow" });

        // Store session data in global temp (session not writable after res.render)
        if (!global._sessionTemp) global._sessionTemp = {};
        global._sessionTemp[jobId] = {
          id: user.id,
          name: user.name,
          email: user.email
        };

        // Clean up after 2 mins
        setTimeout(() => {
          if (global._sessionTemp) delete global._sessionTemp[jobId];
        }, 2 * 60 * 1000);

        // STEP 4: Finalizing
        io.to(jobId).emit("job:progress", { jobId, step: "email" });
        await new Promise(r => setTimeout(r, 600)); // small delay for UX

        // ── DONE ──
        io.to(jobId).emit("job:done", {
          jobId,
          redirect: `/signin/session?jobId=${jobId}`
        });

      } catch (err) {
        console.error("Signin async error:", err);
        io.to(jobId).emit("job:error", {
          jobId,
          message: "Something went wrong. Please try again.",
          redirect: "/signin"
        });
      }
    }, 800);

  } catch (err) {
    console.error(err);
    res.send("Server Error");
  }
});

// ✅ GET: finalize session after loading screen redirects here
router.get("/signin/session", (req, res) => {
  const { jobId } = req.query;

  if (!jobId || !global._sessionTemp || !global._sessionTemp[jobId]) {
    return res.redirect("/signin");
  }

  // Move from global temp into real session
  req.session.user = global._sessionTemp[jobId];
  delete global._sessionTemp[jobId];

  console.log("User signed in:", req.session.user.email);
  res.redirect("/file_add");
});

module.exports = router;
module.exports.processSignin = null; // signin is handled inline via POST route