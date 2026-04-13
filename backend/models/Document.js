const mongoose = require("mongoose");

const DocumentSchema = new mongoose.Schema({
  application_id: String,
  file_type: String,
  file_url: String,
  uploaded_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Document", DocumentSchema);