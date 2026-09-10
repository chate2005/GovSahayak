const mongoose = require("mongoose");

const OTPSchema = new mongoose.Schema({
  email: String,
  otp: String,
  expires_at: Date,
  verified: { type: Boolean, default: false },
  // Set after successful OTP verification; register must be completed within this window
  verified_expires_at: { type: Date, default: null }
});

module.exports = mongoose.model("OTP", OTPSchema);