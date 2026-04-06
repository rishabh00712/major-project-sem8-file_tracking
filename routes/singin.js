const express = require("express");
const router = express.Router(); // ✅ THIS WAS MISSING

const bcrypt = require("bcrypt");
const db = require("../config/db");

// ✅ GET: show signin page
router.get("/", (req, res) => {
  if (req.session.user) {
    return res.redirect("/file_add");
  }

  res.render("sign_in");
});

router.get("/signin", (req, res) => {
  if (req.session.user) {
    return res.redirect("/file_add");
  }

  res.render("sign_in");
});
// ✅ POST: handle signin
router.post("/signin", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await db.query(
      "SELECT * FROM store_emails WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.render("sign_in", {
        error: "Email not registered",
      });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.render("sign_in", {
        error: "Wrong password",
      });
    }

    // ✅ session store
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
    };

    res.redirect("/file_add");

  } catch (err) {
    console.error(err);
    res.send("Server Error");
  }
});

// ✅ EXPORT (VERY IMPORTANT)
module.exports = router;