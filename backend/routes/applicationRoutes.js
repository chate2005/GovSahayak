const express = require("express");
const router = express.Router();
const Application = require("../models/Application");

router.get("/user/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!userId || userId === "null" || userId === "undefined") {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Only return THIS user's applications
    const apps = await Application.find({
      user_id: userId
    }).sort({ createdAt: -1 });

    console.log(`Found ${apps.length} apps for user ${userId}`);

    const formattedApps = apps.map(app => ({
      id: app._id,
      service_type: app.service_type,
      status: app.status,
      extracted_income: app.extracted_income,
      financial_year: app.financial_year,
      certificate_url: app.certificate_url,
      created_at: app.createdAt || "Recent"
    }));

    res.json(formattedApps);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/track/:id", async (req, res) => {
  try {
    const app = await Application.findById(req.params.id);
    if (!app) return res.status(404).json({ error: "Application not found" });

    res.json({
      id: app._id,
      service_type: app.service_type,
      status: app.status,
      extracted_income: app.extracted_income,
      financial_year: app.financial_year,
      certificate_url: app.certificate_url,
      created_at: app.createdAt || "Recent"
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;