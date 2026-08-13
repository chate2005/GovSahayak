const express = require("express");
const router = express.Router();
const { upload } = require("../config/cloudinary");
const domicileController = require("../controllers/domicileController");

// Single document upload — called once per step (3 steps total)
router.post(
  "/upload",
  upload.fields([{ name: "document", maxCount: 1 }]),
  domicileController.uploadDocument
);

module.exports = router;
