const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  phone: String,
  phone_verified: { type: Boolean, default: false },
  email_verified: { type: Boolean, default: false },
  role: { type: String, default: "user" },   // "user" or "officer"
  department_id: String,
  department_name: String,
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);