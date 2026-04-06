const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const db = require("../config/db");
const nodemailer = require("nodemailer");

// ✅ GET: show signup page
router.get("/signup", (req, res) => {
  if (req.session.user) {
    return res.redirect("/file_add");
  }
  res.render("sign_up");
});


// ✅ POST: Signup → Generate OTP + Send Email
router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // check existing user
    const check = await db.query(
      "SELECT * FROM store_emails WHERE email = $1",
      [email]
    );

    if (check.rows.length > 0) {
      return res.render("sign_up", {
        error: "User already exists",
      });
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    console.log("OTP:", otp);

    // ✅ Send OTP via email (same as your old code)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      secure: true,
      port: 465,
      auth: {
        user: "rishabhgarai7@gmail.com",
        pass: "xgabndbrcfwliisj" // ⚠️ move to env later
      }
    });

    const mailOptions = {
      from: "rishabhgarai7@gmail.com",
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP code is: ${otp}`
    };

    transporter.sendMail(mailOptions, async (error, info) => {
      if (error) {
        console.log("Error sending OTP:", error);
        return res.render("sign_up", {
          error: "Failed to send OTP. Try again."
        });
      }

      console.log("OTP sent:", info.response);

      // ✅ Store in session
      req.session.signupData = {
        name,
        email,
        password: hashedPassword,
        otp
      };

      // 👉 Redirect to OTP page
      return res.render("otp_update", {
        action: "/signup/verify",
        email: email
      });
    });

  } catch (err) {
    console.error(err);
    res.send("Error in signup");
  }
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

  if (!data) {
    return res.redirect("/signup");
  }

  console.log("Entered OTP:", enteredOtp);
  console.log("Expected OTP:", data.otp);

  // ❌ wrong OTP
  if (enteredOtp !== data.otp.toString()) {
    return res.render("otp_update", {
      action: "/signup/verify",
      email: data.email,
      error: "Invalid OTP"
    });
  }

  try {
    // ✅ Save user in DB
    await db.query(
      "INSERT INTO store_emails (name, email, password) VALUES ($1, $2, $3)",
      [data.name, data.email, data.password]
    );

    console.log("User registered:", data.email);

    // ✅ clear session
    req.session.signupData = null;

    res.redirect("/signin");

  } catch (err) {
    console.error(err);
    res.send("Error saving user");
  }
});

module.exports = router;