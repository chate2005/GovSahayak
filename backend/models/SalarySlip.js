const mongoose = require("mongoose");

const SalarySlipSchema = new mongoose.Schema({
  unique_number: String,       // extracted unique number from salary slip
  employee_name: String,
  application_id: String,
  used_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("SalarySlip", SalarySlipSchema);