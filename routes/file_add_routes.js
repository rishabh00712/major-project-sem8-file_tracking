const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const isAuth = require("./middleware/auth");
const nodemailer = require("nodemailer");

// ── Mailer setup ──
const transporter = nodemailer.createTransport({
  service: "gmail",
  secure: true,
  port: 465,
  auth: {
    user: "rishabhgarai7@gmail.com",
    pass: "xgabndbrcfwliisj"
  }
});

// ✅ GET all files (protected)
router.get("/file_add", isAuth, async (req, res) => {
  res.render("file_add", { active: "file_add" });
});
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

    // ── Auto insert into file_flow ──
    const isLetter = subject.toLowerCase().includes("letter");
    const flowName = isLetter ? "Ranadeep Dhara" : "Sudip Das";

    await pool.query(
      `INSERT INTO file_flow 
      (docket_number, flow, name, department, date, subject, image_file)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        docket_number,
        "Internal",
        flowName,
        "R&C",
        date,
        "The file is submitted",
        null
      ]
    );

    // ── Format date ──
    const formattedDate = new Date(date).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });

    // ── Send plain text email ──
    const mailOptions = {
      from: '"Research and Consultancy Cell of IIEST Shibpur" <rishabhgarai7@gmail.com>',
      to: email,
      subject: `File Submitted — Docket No. ${docket_number}`,
      text:
`Hello ${pi_name},

Your file has been successfully submitted to the R&C Cell.

Subject  : ${subject}
Date     : ${formattedDate}
Department: ${department}
Docket No: ${docket_number}

This is your unique docket number. Please keep it safe — you can use it to track your file at any time by visiting:

http://localhost:5000/view_flow

If you have any questions, please contact the department directly.

— Research and Consultancy Cell
Indian Institute of Engineering Science and Technology, Shibpur`
    };

    // Send async — don't block redirect
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) console.error("❌ Email failed:", err);
      else console.log("✅ Email sent:", info.response);
    });

    res.redirect("/file_search");

  } catch (err) {
    console.error(err);
    res.send("Error inserting file");
  }
});

module.exports = router;