const express = require("express");
const router = express.Router();

router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.send("Error logging out");
    }

    // ✅ clear cookie from browser
    res.clearCookie("connect.sid");

    // ✅ redirect to signin
    res.redirect("/signin");
  });
});

module.exports = router;