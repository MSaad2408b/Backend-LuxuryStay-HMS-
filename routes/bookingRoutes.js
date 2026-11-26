const express = require("express");
const router = express.Router();

const {
  createBooking,
  getBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
  checkInBooking,
  checkOutBooking,
} = require("../controllers/bookingController");
const { protect, authorizeRoles, requireConsent } = require("../middleware/authmiddleware");
const validate = require("../middleware/validate");
const { validateObjectIdParam } = require("../middleware/validateObjectId");
const { createBookingSchema, updateBookingSchema, cancelBookingSchema } = require("../validation/bookingSchema");

router.param("id", validateObjectIdParam);

const normalizeBookingPayload = (req, res, next) => {
  const b = req.body || {};
  if (!b.room && b.roomId) b.room = b.roomId;
  if (!b.checkInDate && b.checkIn) b.checkInDate = b.checkIn;
  if (!b.checkOutDate && b.checkOut) b.checkOutDate = b.checkOut;
  if (b.guestsCount === undefined && b.guests !== undefined) b.guestsCount = b.guests;
  if (b.guestsCount === undefined && b.numberOfGuests !== undefined) b.guestsCount = b.numberOfGuests;
  if (b.guest === "" || b.guest === null) delete b.guest;
  req.body = b;
  next();
};

router.use(protect);

router.post("/", requireConsent, normalizeBookingPayload, validate(createBookingSchema), createBooking);
router.get("/", getBookings);
router.get("/:id", getBookingById);
router.put("/:id", authorizeRoles("admin", "manager", "receptionist"), normalizeBookingPayload, validate(updateBookingSchema), updateBooking);
router.patch("/:id/cancel", validate(cancelBookingSchema), cancelBooking);
router.patch("/:id/check-in", authorizeRoles("admin", "manager", "receptionist"), checkInBooking);
router.patch("/:id/check-out", authorizeRoles("admin", "manager", "receptionist"), checkOutBooking);

module.exports = router;
