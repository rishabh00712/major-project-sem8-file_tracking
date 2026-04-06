const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const isAuth = require("./middleware/auth");


// ✅ GET all files (protected)
router.get("/file_add", isAuth, async (req, res) => {
    res.render("file_add", { active: "file_add" });
});

// POST: Add file
router.post("/file_add", async (req, res) => {
  try {
    const {
      subject,
      date,
      project_code,
      docket_number,
      description,
      pay_amount,
      payable_name,
      department,
      pi_name,
      email
    } = req.body;

    // Check duplicate
    const check = await pool.query(
      "SELECT * FROM files WHERE docket_number = $1",
      [docket_number]
    );

    if (check.rows.length > 0) {
      return res.send("❌ Docket number already exists");
    }
    const pay_amount_final = pay_amount === "" ? null : pay_amount;
    const payable_name_final = payable_name === "" ? null : payable_name;
    await pool.query(
      `INSERT INTO files 
      (docket_number, subject, date, project_code, description, pay_amount, payable_name, department, pi_name, email)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        docket_number,
        subject,
        date,
        project_code,
        description,
        pay_amount_final,
        payable_name_final,
        department,
        pi_name,
        email
      ]
    );

    res.redirect("/file_search");

  } catch (err) {
    console.error(err);
    res.send("Error inserting file");
  }
});

module.exports = router;