const express = require("express");
const router = express.Router();

const {
  createRoom,
  getRooms,
  getRoomById,
  updateRoom,
  updateRoomStatus,
  deleteRoom,
  getAvailableRooms,
  getRoomStats,
  streamRoomStatus,
} = require("../controllers/roomController");
// Catalogue reads are public so the booking site can be browsed before sign-in.
// Every write below, plus the SSE stream, stays behind authentication.
const { protect, authorizeRoles, requirePermission } = require("../middleware/authmiddleware");
const validate = require("../middleware/validate");
const { validateObjectIdParam } = require("../middleware/validateObjectId");
const {
  createRoomSchema,
  updateRoomSchema,
  updateRoomStatusSchema,
} = require("../validation/roomSchema");

router.param("id", validateObjectIdParam);

router.get("/events", protect, streamRoomStatus);
router.get("/availability/search", getAvailableRooms);
router.get("/stats", protect, getRoomStats);
router.get("/", getRooms);
router.get("/:id", getRoomById);

router.post("/", protect, requirePermission("manage_rooms"), validate(createRoomSchema), createRoom);
router.put("/:id", protect, requirePermission("manage_rooms"), validate(updateRoomSchema), updateRoom);
router.patch(
  "/:id/status",
  protect,
  authorizeRoles("admin", "manager", "receptionist", "housekeeping"),
  validate(updateRoomStatusSchema),
  updateRoomStatus
);
router.delete("/:id", protect, authorizeRoles("admin", "manager"), requirePermission("manage_rooms"), deleteRoom);

module.exports = router;
