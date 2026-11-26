const express = require("express");
const router = express.Router();

const {
  getOverview,
  getHealth,
  getMetrics,
  triggerBackup,
} = require("../controllers/adminController");
const { protect, requirePermission } = require("../middleware/authmiddleware");

// Health is intentionally public for uptime monitors.
router.get("/health", getHealth);

router.use(protect, requirePermission("manage_settings"));
router.get("/overview", getOverview);
router.get("/metrics", getMetrics);
router.post("/backup", requirePermission("run_backup"), triggerBackup);

module.exports = router;
