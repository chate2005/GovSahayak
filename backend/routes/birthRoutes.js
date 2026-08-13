const express = require("express");
const router = express.Router();
const { upload } = require("../config/cloudinary");
const birthController = require("../controllers/birthController");

// Single upload endpoint handling one file "document" at a time
router.post(
  "/upload",
  upload.fields([
    { name: "document", maxCount: 1 }
  ]),
  birthController.uploadDocument
);

module.exports = router;
