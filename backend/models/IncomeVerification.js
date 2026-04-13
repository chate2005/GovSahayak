const mongoose = require("mongoose");

const IncomeSchema = new mongoose.Schema({

  application_id:String,

  name:String,

  aadhaar:String,

  annual_income:Number,

  eligibility_status:String

});

module.exports = mongoose.model("IncomeVerification",IncomeSchema);