require("dotenv").config();
require("./config/db");

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const incomeRoutes = require("./routes/incomeRoutes");
const officerRoutes = require("./routes/officerRoutes");
const applicationRoutes = require("./routes/applicationRoutes");
const otpRoutes = require("./routes/otpRoutes");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/income", incomeRoutes);
app.use("/api/officer", officerRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/otp", otpRoutes);

// Catch 404
app.use((req, res, next) => {
  console.log("404 Not Found:", req.method, req.url);
  res.status(404).json({ error: `Route ${req.url} not found` });
});

// Catch all unhandled errors
app.use((err, req, res, next) => {
  console.error("=== UNHANDLED ERROR ===");
  console.error("URL:", req.url);
  console.error("Method:", req.method);
  console.error("Error name:", err.name);
  console.error("Error message:", err.message);
  console.error("Stack:", err.stack);
  res.status(500).json({
    error: err.message || "Internal server error"
  });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));