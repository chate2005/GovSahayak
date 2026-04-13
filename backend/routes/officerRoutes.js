const express = require("express");
const router = express.Router();
const officerController = require("../controllers/officerController");

router.get("/applications/pending", officerController.getPendingApplications);
router.get("/applications/all", officerController.getAllApplications);
router.get("/applications/:id/documents", officerController.getApplicationDocuments);
router.post("/approve/:id", officerController.approveApplication);
router.post("/reject/:id", officerController.rejectApplication);

module.exports = router;