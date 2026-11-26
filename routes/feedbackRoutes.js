const express = require("express");
const router = express.Router();

const { createFeedback, getFeedback, replyToFeedback } = require("../controllers/feedbackController");
const { protect, authorizeRoles, requireConsent } = require("../middleware/authmiddleware");
const validate = require("../middleware/validate");
const { validateObjectIdParam } = require("../middleware/validateObjectId");
const { createFeedbackSchema, replyFeedbackSchema } = require("../validation/feedbackSchema");

router.param("id", validateObjectIdParam);

router.post("/", protect, authorizeRoles("guest"), requireConsent, validate(createFeedbackSchema), createFeedback);
router.get("/", protect, authorizeRoles("admin", "manager"), getFeedback);
router.patch("/:id/reply", protect, authorizeRoles("admin", "manager"), validate(replyFeedbackSchema), replyToFeedback);

module.exports = router;
