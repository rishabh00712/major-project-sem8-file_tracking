const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ IMPORTANT: add passport
const passport = require("passport");

// ------------------- MIDDLEWARE -------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

// ------------------- SESSION -------------------
const sessionMiddleware = require("./config/session");
app.use(sessionMiddleware);

// ------------------- PASSPORT -------------------
app.use(passport.initialize());
app.use(passport.session());

// ------------------- ROUTES -------------------
const file_routes = require("./routes/file_add_routes");
const search_routes = require("./routes/file_search_routes");
const flow_routes = require("./routes/file_flow_routes");

const signin = require("./routes/singin");
const logout = require("./routes/logout");
const signup = require("./routes/signup");
const forget_password = require("./routes/forget_password");

// ✅ Google Auth route
const googleAuthRoutes = require("./routes/google_auth");
const viewer = require("./routes/viewer_file_flow");
// ------------------- USE ROUTES -------------------
app.use("/", file_routes);
app.use("/", search_routes);
app.use("/", flow_routes);

app.use("/", signin);
app.use("/", signup);
app.use("/", logout);
app.use("/", forget_password);
app.use("/",viewer);
// 👉 IMPORTANT: keep this AFTER passport setup
app.use("/auth", googleAuthRoutes);

// ------------------- SERVER -------------------
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});