const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const db = require("../config/db");
const nodemailer = require("nodemailer");


// ✅ GET: show forgot password page
router.get("/forget_password", (req, res) => {
  res.render("forget_password");
});


// ✅ POST: send OTP + store password in session
router.post("/forget_password", async (req, res) => {
  const { email, password, confirmPassword } = req.body;

  try {
    // ❌ password mismatch
    if (password !== confirmPassword) {
      return res.render("forget_password", {
        error: "Passwords do not match"
      });
    }

    // check if user exists
    const result = await db.query(
      "SELECT * FROM store_emails WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.render("forget_password", {
        error: "Email not registered"
      });
    }

    // ✅ hash password NOW
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    console.log("OTP:", otp);

    // ✅ send email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      secure: true,
      port: 465,
      auth: {
        user: "rishabhgarai7@gmail.com",
        pass: "xgabndbrcfwliisj" // ⚠️ move to .env later
      }
    });

    const mailOptions = {
      from: "rishabhgarai7@gmail.com",
      to: email,
      subject: "Password Reset OTP",
      text: `Your OTP code is: ${otp}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("Email error:", error);
        return res.render("forget_password", {
          error: "Failed to send OTP"
        });
      }

      console.log("OTP sent:", info.response);

      // ✅ store EVERYTHING in session
      req.session.resetData = {
        email,
        password: hashedPassword,
        otp
      };

      // go to OTP page
      return res.render("otp_update", {
        action: "/forget_password/verify",
        email: email
      });
    });

  } catch (err) {
    console.log(err);
    res.send("Error");
  }
});


// ✅ POST: verify OTP + update password (NO password input needed here)
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

  // ❌ wrong OTP
  if (enteredOtp !== data.otp.toString()) {
    return res.render("otp_update", {
      action: "/forget_password/verify",
      email: data.email,
      error: "Invalid OTP"
    });
  }

  try {
    // ✅ update DB directly (password already hashed)
    await db.query(
      "UPDATE store_emails SET password=$1 WHERE email=$2",
      [data.password, data.email]
    );

    console.log("Password updated:", data.email);

    // ✅ clear session
    req.session.resetData = null;

    res.redirect("/signin");

  } catch (err) {
    console.log(err);
    res.send("Error updating password");
  }
});

module.exports = router;