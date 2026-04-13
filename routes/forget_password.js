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

// ✅ GET: show forgot password page
router.get("/forget_password", (req, res) => {
  res.render("forget_password");
});

// ✅ POST: forget password with socket loading
router.post("/forget_password", async (req, res) => {
  const { email, password, confirmPassword } = req.body;
  const io = req.app.get("io");

  try {
    // ❌ password mismatch — catch before render
    if (password !== confirmPassword) {
      return res.render("forget_password", {
        error: "Passwords do not match"
      });
    }

    const jobId = `reset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // ── Render loading screen immediately ──
    res.render("loading_email", { jobId });

    setTimeout(async () => {
      try {

        // STEP 1: Check user exists in DB
        io.to(jobId).emit("job:progress", { jobId, step: "db" });

        const result = await db.query(
          "SELECT * FROM store_emails WHERE email=$1",
          [email]
        );

        if (result.rows.length === 0) {
          return io.to(jobId).emit("job:error", {
            jobId,
            message: "Email not registered.",
            redirect: "/forget_password"
          });
        }

        // STEP 2: Hash new password
        io.to(jobId).emit("job:progress", { jobId, step: "encrypt" });
        const hashedPassword = await bcrypt.hash(password, 10);

        // STEP 3: Generate OTP + store in global temp
        io.to(jobId).emit("job:progress", { jobId, step: "flow" });

        const otp = Math.floor(100000 + Math.random() * 900000);
        console.log("Reset OTP:", otp);

        if (!global._resetTemp) global._resetTemp = {};
        global._resetTemp[jobId] = {
          email,
          password: hashedPassword,
          otp
        };

        // Clean up after 10 mins
        setTimeout(() => {
          if (global._resetTemp) delete global._resetTemp[jobId];
        }, 10 * 60 * 1000);

        // STEP 4: Send OTP email
        io.to(jobId).emit("job:progress", { jobId, step: "email" });

        const mailOptions = {
          from: '"Research and Consultancy Cell of IIEST Shibpur" <rishabhgarai7@gmail.com>',
          to: email,
          subject: "Password Reset OTP — IIEST R&C Cell",
          text:
`Hello,

Your OTP code for password reset is: ${otp}

This OTP is valid for 10 minutes. Do not share it with anyone.

If you did not request a password reset, please ignore this email.

— Research and Consultancy Cell
Indian Institute of Engineering Science and Technology, Shibpur`
        };

        await transporter.sendMail(mailOptions);
        console.log("Reset OTP sent to:", email);

        // ── DONE ──
        io.to(jobId).emit("job:done", {
          jobId,
          redirect: `/forget_password/otp?jobId=${jobId}&email=${encodeURIComponent(email)}`
        });

      } catch (err) {
        console.error("Forget password async error:", err);
        io.to(jobId).emit("job:error", {
          jobId,
          message: "Something went wrong. Please try again.",
          redirect: "/forget_password"
        });
      }
    },800);

  } catch (err) {
    console.error(err);
    res.send("Error");
  }
});

// ✅ GET: OTP page (after loading screen redirects here)
router.get("/forget_password/otp", (req, res) => {
  const { jobId, email } = req.query;

  if (!jobId || !global._resetTemp || !global._resetTemp[jobId]) {
    return res.redirect("/forget_password");
  }

  // Move from global temp into session
  req.session.resetData = global._resetTemp[jobId];
  delete global._resetTemp[jobId];

  return res.render("otp_update", {
    action: "/forget_password/verify",
    email: email
  });
});

// ✅ POST: verify OTP + update password
router.post("/forget_password/verify", async (req, res) => {
  const enteredOtp =
    (req.body.digit1 || "") +
    (req.body.digit2 || "") +
    (req.body.digit3 || "") +
    (req.body.digit4 || "") +
    (req.body.digit5 || "") +
    (req.body.digit6 || "");

  const data = req.session.resetData;

  if (!data) {
    return res.redirect("/forget_password");
  }

  console.log("Entered OTP:", enteredOtp);
  console.log("Expected OTP:", data.otp);

  // ❌ Wrong OTP
  if (enteredOtp !== data.otp.toString()) {
    return res.render("otp_update", {
      action: "/forget_password/verify",
      email: data.email,
      error: "Invalid OTP"
    });
  }

  try {
    // ✅ Update password in DB
    await db.query(
      "UPDATE store_emails SET password=$1 WHERE email=$2",
      [data.password, data.email]
    );

    console.log("Password updated:", data.email);

    req.session.resetData = null;
    res.redirect("/signin");

  } catch (err) {
    console.error(err);
    res.send("Error updating password");
  }
});

module.exports = router;