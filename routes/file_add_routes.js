const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const isAuth = require("./middleware/auth");
const nodemailer = require("nodemailer");
const { clearSearchCache } = require("../config/cache");

const transporter = nodemailer.createTransport({
  service: "gmail",
  secure: true,
  port: 465,
  auth: {
    user: "rishabhgarai7@gmail.com",
    pass: "xgabndbrcfwliisj"
  }
});

// ✅ GET: file add page (protected)
router.get("/file_add", isAuth, async (req, res) => {
  res.render("file_add", { active: "file_add" });
});

// ✅ POST: file add with socket loading
router.post("/file_add", async (req, res) => {
  const io = req.app.get("io");

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

    const jobId = `fileadd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // ── Render loading screen immediately ──
    res.render("loading_email", { jobId });

    setImmediate(async () => {
      try {

        // STEP 1: Check duplicate docket
        io.to(jobId).emit("job:progress", { jobId, step: "db" });

        const check = await pool.query(
          "SELECT * FROM files WHERE docket_number = $1",
          [docket_number]
        );

        if (check.rows.length > 0) {
          return io.to(jobId).emit("job:error", {
            jobId,
            message: "Docket number already exists.",
            redirect: "/file_add"
          });
        }

        const pay_amount_final   = pay_amount   === "" ? null : pay_amount;
        const payable_name_final = payable_name === "" ? null : payable_name;

        // Insert into files table
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

        // STEP 2: Encrypting / securing data
        io.to(jobId).emit("job:progress", { jobId, step: "encrypt" });
        await new Promise(r => setTimeout(r, 700));

        // STEP 3: Insert into file_flow
        io.to(jobId).emit("job:progress", { jobId, step: "flow" });

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

        // STEP 4: Send email
        io.to(jobId).emit("job:progress", { jobId, step: "email" });

        const formattedDate = new Date(date).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "long",
          year: "numeric"
        });

        const mailOptions = {
          from: '"Research and Consultancy Cell of IIEST Shibpur" <rishabhgarai7@gmail.com>',
          to: email,
          subject: `File Submitted — Docket No. ${docket_number}`,
          text:
`Hello ${pi_name},

Your file has been successfully submitted to the R&C Cell.

Subject   : ${subject}
Date      : ${formattedDate}
Department: ${department}
Docket No : ${docket_number}

This is your unique docket number. Please keep it safe — you can use it to track your file at any time by visiting:

http://localhost:5000/view_flow

If you have any questions, please contact the department directly.

— Research and Consultancy Cell
Indian Institute of Engineering Science and Technology, Shibpur`
        };

        await transporter.sendMail(mailOptions);
        console.log("✅ Email sent to:", email);
        
        await clearSearchCache();
        
        // ── DONE ──
        io.to(jobId).emit("job:done", {
          jobId,
          redirect: "/file_search"
        });

      } catch (err) {
        console.error("File add async error:", err);
        io.to(jobId).emit("job:error", {
          jobId,
          message: "Something went wrong. Please try again.",
          redirect: "/file_add"
        });
      }
    },800);

  } catch (err) {
    console.error(err);
    res.send("Error inserting file");
  }
});

module.exports = router;