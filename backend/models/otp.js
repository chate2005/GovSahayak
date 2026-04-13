const mongoose = require("mongoose");

const OTPSchema = new mongoose.Schema({
  email: String,
  otp: String,
  expires_at: Date,
  verified: { type: Boolean, default: false }
});

module.exports = mongoose.model("OTP", OTPSchema);