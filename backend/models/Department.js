const mongoose = require("mongoose");

const DepartmentSchema = new mongoose.Schema({
  department_id: { type: String, unique: true },
  department_name: String,
  active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Department", DepartmentSchema);