const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("./config/db");

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const incomeRoutes = require("./routes/incomeRoutes");
const officerRoutes = require("./routes/officerRoutes");
const applicationRoutes = require("./routes/applicationRoutes");
const otpRoutes = require("./routes/otpRoutes");
const birthRoutes = require("./routes/birthRoutes");
const domicileRoutes = require("./routes/domicileRoutes");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve the web portal static files
const fs = require("fs");
const portalPath = path.join(__dirname, "../portal");
const localPortalPath = path.join(__dirname, "portal");
if (fs.existsSync(portalPath)) {
  app.use("/portal", express.static(portalPath));
} else if (fs.existsSync(localPortalPath)) {
  app.use("/portal", express.static(localPortalPath));
}

app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/income", incomeRoutes);
app.use("/api/birth", birthRoutes);
app.use("/api/domicile", domicileRoutes);
app.use("/api/officer", officerRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/otp", otpRoutes);

// Health check endpoints (for Render, UptimeRobot, keep-alive monitors)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", uptime: process.uptime(), timestamp: new Date().toISOString() });
});
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK", uptime: process.uptime(), timestamp: new Date().toISOString() });
});
app.get("/", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "GovSahayak API Server is live & running!",
    timestamp: new Date().toISOString()
  });
});

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
app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));