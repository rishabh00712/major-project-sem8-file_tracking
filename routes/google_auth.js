const express = require("express");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const db = require("../config/db");

const router = express.Router();

// ================== PASSPORT CONFIG ==================
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      //console.log("🔥 Google profile received:");

      const email = profile.emails?.[0]?.value;
      const name = profile.displayName;

      console.log("📧 Email:", email);
      console.log("👤 Name:", name);

      if (!email) {
        console.log("❌ No email found in profile");
        return done(null, false);
      }

      // 🔍 Check user
      const result = await db.query(
        "SELECT * FROM store_emails WHERE email=$1",
        [email]
      );


      if (result.rows.length > 0) {
        console.log("✅ Existing user found");
        return done(null, result.rows[0]);
      } else {
        console.log("🆕 Creating new user");

        const newUser = await db.query(
          "INSERT INTO store_emails (name, email, password) VALUES ($1,$2,$3) RETURNING *",
          [name, email, "google_auth"]
        );

        console.log("✅ New user created:");

        return done(null, newUser.rows[0]);
      }

    } catch (err) {
      console.log("❌ ERROR in Google Strategy:", err);
      return done(err, null);
    }
  }
));

// ================== SESSION ==================
passport.serializeUser((user, done) => {
  //console.log("💾 serializeUser:", user.id);
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    console.log("🔄 deserializeUser ID:", id);

    const result = await db.query(
      "SELECT * FROM store_emails WHERE id=$1",
      [id]
    );

   console.log("👤 User loaded from DB:");

    done(null, result.rows[0]);
  } catch (err) {
    console.log("❌ ERROR in deserialize:", err);
    done(err, null);
  }
});

// ================== ROUTES ==================

// 👉 start login
router.get("/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// 👉 callback
router.get("/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/signin"
  }),
  (req, res) => {
    console.log("🎉 LOGIN SUCCESS:");
    res.redirect("/file_add"); // 👈 change here if needed
  }
);

module.exports = router;