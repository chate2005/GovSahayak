const express = require("express");
const router = express.Router();
const { upload } = require("../config/cloudinary");
const incomeController = require("../controllers/incomeController");

router.post(
  "/upload",
  upload.fields([
    { name: "aadhaar" },
    { name: "income_proof" }
  ]),
  incomeController.uploadDocuments
);

module.exports = router;