const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const db = require("../config/db");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  secure: true,
  port: 465,
  auth: {
    user: "rishabhgarai7@gmail.com",
    pass: "xgabndbrcfwliisj"
  }
});

// ✅ GET: show signup page
router.get("/signup", (req, res) => {
  if (req.session.user) return res.redirect("/file_add");
  res.render("sign_up");
});

// ✅ POST: Signup → socket loading screen → OTP
router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;
  const io = req.app.get("io");

  try {
    const jobId = `signup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Render loading screen immediately
    res.render("loading_email", { jobId });

    setTimeout(async () => {
      try {
        // STEP 1: Check existing user
        io.to(jobId).emit("job:progress", { jobId, step: "db" });
        await new Promise(r => setTimeout(r, 500));

        const check = await db.query(
          "SELECT * FROM store_emails WHERE email = $1",
          [email]
        );

        if (check.rows.length > 0) {
          return io.to(jobId).emit("job:error", {
            jobId,
            message: "An account with this email already exists.",
            redirect: "/signup"
          });
        }

        // STEP 2: Hash password
        io.to(jobId).emit("job:progress", { jobId, step: "encrypt" });
        await new Promise(r => setTimeout(r, 500));
        const hashedPassword = await bcrypt.hash(password, 10);

        // STEP 3: Generate OTP
        io.to(jobId).emit("job:progress", { jobId, step: "flow" });
        await new Promise(r => setTimeout(r, 500));

        const otp = Math.floor(100000 + Math.random() * 900000);
        console.log("OTP:", otp);

        if (!global._signupTemp) global._signupTemp = {};
        global._signupTemp[jobId] = { name, email, password: hashedPassword, otp };

        setTimeout(() => {
          if (global._signupTemp) delete global._signupTemp[jobId];
        }, 10 * 60 * 1000);

        // STEP 4: Send OTP email
        io.to(jobId).emit("job:progress", { jobId, step: "email" });
        await new Promise(r => setTimeout(r, 400));

        const mailOptions = {
          from: '"Research and Consultancy Cell of IIEST Shibpur" <rishabhgarai7@gmail.com>',
          to: email,
          subject: "Your OTP Code — IIEST R&C Cell",
          text:
`Hello ${name},

Your OTP code for signup is: ${otp}

This OTP is valid for 10 minutes. Do not share it with anyone.

— Research and Consultancy Cell
Indian Institute of Engineering Science and Technology, Shibpur`
        };

        await transporter.sendMail(mailOptions);
        console.log("OTP sent to:", email);

        // ── DONE ──
        io.to(jobId).emit("job:done", {
          jobId,
          redirect: `/signup/otp?jobId=${jobId}&email=${encodeURIComponent(email)}`
        });

      } catch (err) {
        console.error("Signup async error:", err);
        io.to(jobId).emit("job:error", {
          jobId,
          message: "Something went wrong. Please try again.",
          redirect: "/signup"
        });
      }
    },800);

  } catch (err) {
    console.error(err);
    res.send("Error in signup");
  }
});

// ✅ GET: OTP page
router.get("/signup/otp", (req, res) => {
  const { jobId, email } = req.query;

  if (!jobId || !global._signupTemp || !global._signupTemp[jobId]) {
    return res.redirect("/signup");
  }

  req.session.signupData = global._signupTemp[jobId];
  delete global._signupTemp[jobId];

  return res.render("otp_update", {
    action: "/signup/verify",
    email: email
  });
});

// ✅ POST: VERIFY OTP → FINAL SAVE
router.post("/signup/verify", async (req, res) => {
  const enteredOtp =
    (req.body.digit1 || "") +
    (req.body.digit2 || "") +
    (req.body.digit3 || "") +
    (req.body.digit4 || "") +
    (req.body.digit5 || "") +
    (req.body.digit6 || "");

  const data = req.session.signupData;

  if (!data) return res.redirect("/signup");

  console.log("Entered OTP:", enteredOtp);
  console.log("Expected OTP:", data.otp);

  if (enteredOtp !== data.otp.toString()) {
    return res.render("otp_update", {
      action: "/signup/verify",
      email: data.email,
      error: "Invalid OTP"
    });
  }

  try {
    await db.query(
      "INSERT INTO store_emails (name, email, password) VALUES ($1, $2, $3)",
      [data.name, data.email, data.password]
    );

    console.log("User registered:", data.email);
    req.session.signupData = null;
    res.redirect("/signin");

  } catch (err) {
    console.error(err);
    res.send("Error saving user");
  }
});

module.exports = router;