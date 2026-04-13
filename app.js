const express = require("express");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 5000;

// ✅ Passport
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
const file_routes      = require("./routes/file_add_routes");
const search_routes    = require("./routes/file_search_routes");
const flow_routes      = require("./routes/file_flow_routes");
const signin           = require("./routes/singin");
const logout           = require("./routes/logout");
const signup           = require("./routes/signup");
const forget_password  = require("./routes/forget_password");
const googleAuthRoutes = require("./routes/google_auth");
const viewer           = require("./routes/viewer_file_flow");

// ------------------- SOCKET.IO -------------------
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

io.on("connection", (socket) => {
  console.log("🔌 Socket connected:", socket.id);

  socket.on("job:subscribe", ({ jobId }) => {
    socket.join(jobId);
    console.log(`📌 Socket ${socket.id} subscribed to job: ${jobId}`);
    // Processing is handled inside each route's setImmediate — nothing to do here
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
  });
});

// ✅ Make io accessible in all routes
app.set("io", io);

// ------------------- USE ROUTES -------------------
app.use("/", file_routes);
app.use("/", search_routes);
app.use("/", flow_routes);
app.use("/", signin);
app.use("/", signup);
app.use("/", logout);
app.use("/", forget_password);
app.use("/", viewer);
app.use("/auth", googleAuthRoutes);

// ------------------- SERVER -------------------
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`✅ Socket.io ready`);
});