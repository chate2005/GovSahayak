const mongoose = require("mongoose");

const PasswordResetSchema = new mongoose.Schema({
  email: String,
  code: String,          // ← 6 digit code instead of long token
  expires_at: Date
});

module.exports = mongoose.model("PasswordReset", PasswordResetSchema);