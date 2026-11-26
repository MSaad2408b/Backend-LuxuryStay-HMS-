const express = require("express");
const router = express.Router();

const {
  createMaintenanceRequest,
  getMaintenanceRequests,
  updateMaintenanceRequest,
} = require("../controllers/maintenanceController");
const { protect, authorizeRoles } = require("../middleware/authmiddleware");
const validate = require("../middleware/validate");
const { validateObjectIdParam } = require("../middleware/validateObjectId");
const {
  createMaintenanceRequestSchema,
  updateMaintenanceRequestSchema,
} = require("../validation/maintenanceSchema");

router.param("id", validateObjectIdParam);

router.use(protect);

router.post("/", validate(createMaintenanceRequestSchema), createMaintenanceRequest);
router.get("/", getMaintenanceRequests);
router.put("/:id", authorizeRoles("admin", "manager", "receptionist", "housekeeping"), validate(updateMaintenanceRequestSchema), updateMaintenanceRequest);

module.exports = router;
