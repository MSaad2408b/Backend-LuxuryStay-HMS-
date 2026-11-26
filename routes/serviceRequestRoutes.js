const express = require("express");
const router = express.Router();

const {
  createServiceRequest,
  getServiceRequests,
  updateServiceRequest,
} = require("../controllers/serviceRequestController");
const { protect, authorizeRoles, requireConsent } = require("../middleware/authmiddleware");
const validate = require("../middleware/validate");
const { validateObjectIdParam } = require("../middleware/validateObjectId");
const {
  createServiceRequestSchema,
  updateServiceRequestSchema,
} = require("../validation/serviceRequestSchema");

router.param("id", validateObjectIdParam);

router.use(protect);

router.post("/", authorizeRoles("guest"), requireConsent, validate(createServiceRequestSchema), createServiceRequest);
router.get("/", getServiceRequests);
router.put("/:id", authorizeRoles("admin", "manager", "receptionist"), validate(updateServiceRequestSchema), updateServiceRequest);

module.exports = router;
