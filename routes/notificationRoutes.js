const express = require("express");
const router = express.Router();

const {
  getMyNotifications,
  markNotificationRead,
  markAllRead,
  createNotification,
  deleteNotification,
  getPreferences,
  updatePreferences,
} = require("../controllers/notificationController");
const { protect, authorizeRoles } = require("../middleware/authmiddleware");
const validate = require("../middleware/validate");
const { validateObjectIdParam } = require("../middleware/validateObjectId");
const { createNotificationSchema } = require("../validation/notificationSchema");
const { notificationPreferenceSchema } = require("../validation/notificationPreferenceSchema");

router.param("id", validateObjectIdParam);

router.use(protect);

router.get("/preferences", getPreferences);
router.put("/preferences", validate(notificationPreferenceSchema), updatePreferences);
router.get("/", getMyNotifications);
router.post("/", authorizeRoles("admin", "manager"), validate(createNotificationSchema), createNotification);
router.patch("/read-all", markAllRead);
router.patch("/:id/read", markNotificationRead);
router.delete("/:id", deleteNotification);

module.exports = router;
