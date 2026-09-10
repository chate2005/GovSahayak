const mongoose = require("mongoose");

if (!process.env.MONGO_URI) {
  console.error("❌ CRITICAL: MONGO_URI environment variable is missing! Please configure MONGO_URI in your Railway Variables dashboard.");
}

mongoose.connect(process.env.MONGO_URI, {
  // ── Fix for: wsarecv TCP connection forcibly closed ──────────────────────
  serverSelectionTimeoutMS: 10000,  // Give up after 10s if can't reach server
  socketTimeoutMS: 45000,           // Close sockets after 45s of inactivity
  connectTimeoutMS: 10000,          // Initial connection timeout
  heartbeatFrequencyMS: 10000,      // Check connection health every 10s
  family: 4                         // Force IPv4 (avoids some Windows IPv6 issues)
})
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ MongoDB Error:", err));

// Auto-reconnect on unexpected disconnect
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️  MongoDB disconnected — attempting reconnect...");
  setTimeout(() => {
    mongoose.connect(process.env.MONGO_URI, { family: 4 })
      .catch(e => console.error("Reconnect failed:", e.message));
  }, 5000);
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err.message);
});

module.exports = mongoose;