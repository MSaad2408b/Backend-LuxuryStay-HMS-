const express = require("express");
const router = express.Router();

const {
  getDashboardSummary,
  getOccupancyReport,
  getRevenueReport,
  getFeedbackReport,
  exportOccupancyReport,
  exportRevenueReport,
  exportFeedbackReport,
  getDemandForecast,
  getPricingInsights,
  getOccupancyByType,
  getRevenueByService,
  getCustomReport,
} = require("../controllers/reportController");
const { protect, requirePermission } = require("../middleware/authmiddleware");

router.use(protect, requirePermission("view_reports"));

router.get("/dashboard", getDashboardSummary);
router.get("/occupancy", getOccupancyReport);
router.get("/occupancy/by-type", getOccupancyByType);
router.get("/occupancy/export", exportOccupancyReport);
router.get("/revenue", getRevenueReport);
router.get("/revenue/by-service", getRevenueByService);
router.get("/revenue/export", exportRevenueReport);
router.get("/feedback", getFeedbackReport);
router.get("/feedback/export", exportFeedbackReport);
router.get("/analytics/forecast", getDemandForecast);
router.get("/analytics/pricing", getPricingInsights);
router.get("/custom", getCustomReport);

module.exports = router;
