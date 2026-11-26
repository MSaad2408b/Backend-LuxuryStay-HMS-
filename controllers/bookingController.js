const crypto = require("crypto");
const Booking = require("../models/Booking");
const Room = require("../models/Room");
const User = require("../models/UserSchema");
const HousekeepingTask = require("../models/HousekeepingTask");
const { createNotification } = require("../utils/notification");
const { logAudit } = require("../utils/auditLogger");
const { broadcastRoomStatus } = require("../utils/eventBus");
const { withLock } = require("../utils/lock");
const { createInvoiceForBooking } = require("../services/invoiceService");
const { calculateNights } = require("../services/invoiceService");
const { sendEmail, templates } = require("../utils/email");

const generateConfirmationCode = () => {
  const datePart = Date.now().toString(36).toUpperCase();
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `LS-${datePart}-${randomPart}`;
};

const hasOverlap = async (roomId, checkInDate, checkOutDate, excludeBookingId = null) => {
  const filter = {
    room: roomId,
    status: { $in: ["reserved", "checked_in"] },
    checkInDate: { $lt: new Date(checkOutDate) },
    checkOutDate: { $gt: new Date(checkInDate) },
  };
  if (excludeBookingId) filter._id = { $ne: excludeBookingId };
  return Boolean(await Booking.findOne(filter).lean());
};

const pushStatusHistory = (booking, status, userId, note = "") => {
  booking.statusHistory.push({
    status,
    changedAt: new Date(),
    changedBy: userId || null,
    note,
  });
};

const setRoomStatus = async (roomId, status) => {
  const room = await Room.findByIdAndUpdate(roomId, { status }, { new: true });
  if (room) broadcastRoomStatus(roomId, status, { roomNumber: room.roomNumber });
  return room;
};

const createBooking = async (req, res) => {
  try {
    const { room: roomValue, roomId: roomIdValue, checkInDate, checkOutDate, guestsCount, specialRequests } = req.body;
    const roomId = roomValue || roomIdValue;
    const userRole = String(req.user?.role || "").toLowerCase();
    const staffRoles = ["admin", "manager", "receptionist"];
    const guestId = staffRoles.includes(userRole) ? req.body.guest : req.user._id;

    if (!guestId) return res.status(400).json({ message: "Guest is required" });

    const result = await withLock(`room:${roomId}`, async () => {
      const guest = await User.findById(guestId);
      if (!guest || !guest.isActive) return { error: 404, message: "Guest not found or inactive" };

      const room = await Room.findById(roomId);
      if (!room || !room.isActive) return { error: 404, message: "Room not found or inactive" };
      if (room.status === "maintenance") return { error: 400, message: "Room is currently under maintenance" };
      if (guestsCount > room.capacity) return { error: 400, message: "Guest count exceeds room capacity" };

      const nights = calculateNights(checkInDate, checkOutDate);
      if (nights < 1 || new Date(checkOutDate) <= new Date(checkInDate)) {
        return { error: 400, message: "Check-out date must be after check-in date" };
      }
      if (await hasOverlap(roomId, checkInDate, checkOutDate)) {
        return { error: 409, message: "Room is not available for the selected dates" };
      }

      const booking = await Booking.create({
        guest: guestId,
        room: roomId,
        checkInDate,
        checkOutDate,
        guestsCount,
        totalAmount: nights * room.pricePerNight,
        specialRequests: specialRequests || "",
        confirmationCode: generateConfirmationCode(),
        createdBy: req.user._id,
        statusHistory: [{ status: "reserved", changedAt: new Date(), changedBy: req.user._id, note: "Booking created" }],
      });

      if (room.status === "available") await setRoomStatus(roomId, "reserved");

      await createNotification({
        recipient: guestId,
        title: "Booking Confirmed",
        message: `Your booking ${booking.confirmationCode} has been created for room ${room.roomNumber}.`,
        type: "booking",
        relatedId: booking._id,
        emailHtml: templates.bookingConfirmed(guest.name, booking.confirmationCode),
      });
      await createNotification({
        recipientRole: "receptionist",
        title: "New Booking",
        message: `New booking ${booking.confirmationCode} created for room ${room.roomNumber}.`,
        type: "booking",
        relatedId: booking._id,
      });

      await logAudit(req, {
        action: "CREATE_BOOKING",
        resource: "Booking",
        resourceId: booking._id,
        details: { confirmationCode: booking.confirmationCode, room: room.roomNumber },
      });

      return { bookingId: booking._id };
    });

    if (result.error) return res.status(result.error).json({ message: result.message });

    const populatedBooking = await Booking.findById(result.bookingId)
      .populate("guest", "name email contact")
      .populate("room", "roomNumber type pricePerNight");

    res.status(201).json({ message: "Booking created successfully", booking: populatedBooking });
  } catch (error) {
    res.status(500).json({ message: "Failed to create booking", error: error.message });
  }
};

const getBookings = async (req, res) => {
  try {
    const { status, guest, room, from, to } = req.query;
    const filter = {};

    if (req.user.role === "guest") filter.guest = req.user._id;
    else if (guest) filter.guest = guest;
    if (status) filter.status = status;
    if (room) filter.room = room;
    if (from || to) {
      filter.checkInDate = {};
      if (from) filter.checkInDate.$gte = new Date(from);
      if (to) filter.checkInDate.$lte = new Date(to);
    }

    const bookings = await Booking.find(filter)
      .populate("guest", "name email contact")
      .populate("room", "roomNumber type pricePerNight status")
      .sort({ createdAt: -1 });

    res.status(200).json({ bookings });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch bookings", error: error.message });
  }
};

const getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("guest", "name email contact")
      .populate("room", "roomNumber type pricePerNight status")
      .populate("statusHistory.changedBy", "name email role");

    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (req.user.role === "guest" && String(booking.guest._id) !== String(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }
    res.status(200).json({ booking });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch booking", error: error.message });
  }
};

const updateBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (["checked_out", "cancelled"].includes(booking.status)) {
      return res.status(400).json({ message: "Completed or cancelled bookings cannot be updated" });
    }

    const oldRoomId = String(booking.room);
    const nextRoomId = String(req.body.room || booking.room);

    const result = await withLock(`room:${oldRoomId}:${nextRoomId}`, async () => {
      const nextCheckIn = req.body.checkInDate || booking.checkInDate;
      const nextCheckOut = req.body.checkOutDate || booking.checkOutDate;
      if (new Date(nextCheckOut) <= new Date(nextCheckIn)) {
        return { error: 400, message: "Check-out date must be after check-in date" };
      }

      const room = await Room.findById(nextRoomId);
      if (!room || !room.isActive) return { error: 404, message: "Room not found or inactive" };

      const guestsCount = req.body.guestsCount || booking.guestsCount;
      if (guestsCount > room.capacity) return { error: 400, message: "Guest count exceeds room capacity" };
      if (await hasOverlap(nextRoomId, nextCheckIn, nextCheckOut, booking._id)) {
        return { error: 409, message: "Room is not available for the selected dates" };
      }

      booking.room = nextRoomId;
      booking.checkInDate = nextCheckIn;
      booking.checkOutDate = nextCheckOut;
      booking.guestsCount = guestsCount;
      booking.totalAmount = calculateNights(nextCheckIn, nextCheckOut) * room.pricePerNight;
      if (req.body.specialRequests !== undefined) booking.specialRequests = req.body.specialRequests;
      if (req.body.paymentStatus) booking.paymentStatus = req.body.paymentStatus;
      await booking.save();

      if (oldRoomId !== nextRoomId) {
        const activeInOldRoom = await Booking.exists({
          room: oldRoomId,
          status: { $in: ["reserved", "checked_in"] },
          _id: { $ne: booking._id },
        });
        if (!activeInOldRoom) {
          const oldRoom = await Room.findById(oldRoomId);
          if (oldRoom) {
            // A guest who moved rooms leaves a dirty room behind; a room that
            // was only held for this booking simply becomes free again.
            const nextStatus =
              booking.status === "checked_in"
                ? "cleaning"
                : oldRoom.status === "maintenance"
                  ? "maintenance"
                  : "available";
            if (oldRoom.status !== nextStatus) await setRoomStatus(oldRoomId, nextStatus);
          }
        }
      }
      if (booking.status === "checked_in") await setRoomStatus(nextRoomId, "occupied");
      else if (booking.status === "reserved") await setRoomStatus(nextRoomId, "reserved");

      await logAudit(req, { action: "UPDATE_BOOKING", resource: "Booking", resourceId: booking._id });
      return { bookingId: booking._id };
    });

    if (result.error) return res.status(result.error).json({ message: result.message });

    const updated = await Booking.findById(result.bookingId)
      .populate("guest", "name email contact")
      .populate("room", "roomNumber type pricePerNight status");
    res.status(200).json({ message: "Booking updated successfully", booking: updated });
  } catch (error) {
    res.status(500).json({ message: "Failed to update booking", error: error.message });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (req.user.role === "guest" && String(booking.guest) !== String(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (booking.status === "checked_out") return res.status(400).json({ message: "Checked out bookings cannot be cancelled" });
    if (booking.status === "cancelled") return res.status(400).json({ message: "Booking is already cancelled" });
    if (booking.status === "checked_in") {
      return res.status(400).json({ message: "Checked-in bookings must be checked out instead of cancelled" });
    }

    const result = await withLock(`room:${String(booking.room)}`, async () => {
      booking.status = "cancelled";
      booking.cancellationReason = req.body?.reason || req.body?.cancellationReason || "";
      pushStatusHistory(booking, "cancelled", req.user._id, booking.cancellationReason || "Booking cancelled");
      await booking.save();

      // Only a room that was being held for this booking is released again;
      // cleaning/maintenance states are owned by other workflows.
      const room = await Room.findById(booking.room);
      if (room && room.status === "reserved") {
        const activeBooking = await Booking.exists({
          room: booking.room,
          status: { $in: ["reserved", "checked_in"] },
          _id: { $ne: booking._id },
        });
        if (!activeBooking) await setRoomStatus(booking.room, "available");
      }

      const guest = await User.findById(booking.guest).select("name email");
      await createNotification({
        recipient: booking.guest,
        title: "Booking Cancelled",
        message: `Booking ${booking.confirmationCode} has been cancelled.`,
        type: "booking",
        relatedId: booking._id,
        emailHtml: templates.bookingCancelled(guest?.name || "Guest", booking.confirmationCode),
      });
      await logAudit(req, {
        action: "CANCEL_BOOKING",
        resource: "Booking",
        resourceId: booking._id,
        details: { reason: booking.cancellationReason },
      });
      return { bookingId: booking._id };
    });

    if (result.error) return res.status(result.error).json({ message: result.message });
    const cancelled = await Booking.findById(result.bookingId).populate("room", "roomNumber status");
    res.status(200).json({ message: "Booking cancelled successfully", booking: cancelled });
  } catch (error) {
    res.status(500).json({ message: "Failed to cancel booking", error: error.message });
  }
};

const checkInBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.status !== "reserved") return res.status(400).json({ message: "Only reserved bookings can be checked in" });

    const result = await withLock(`room:${String(booking.room)}`, async () => {
      booking.status = "checked_in";
      booking.actualCheckIn = new Date();
      booking.keyCard = {
        number: `KEY-${booking.confirmationCode.slice(-8)}`,
        issuedAt: new Date(),
        issuedBy: req.user._id,
        returnedAt: null,
        returnedBy: null,
      };
      pushStatusHistory(booking, "checked_in", req.user._id, "Guest checked in; key issued");
      await booking.save();

      await setRoomStatus(booking.room, "occupied");
      const guest = await User.findById(booking.guest).select("name email");
      await createNotification({
        recipient: booking.guest,
        title: "Check-in Complete",
        message: `You are checked in. Your key card number is ${booking.keyCard.number}.`,
        type: "booking",
        relatedId: booking._id,
        emailHtml: templates.generic("Check-in Complete", `<p>Hello ${guest?.name || "Guest"},</p><p>Your key card number is <strong>${booking.keyCard.number}</strong>. Enjoy your stay!</p>`),
      });
      await logAudit(req, { action: "CHECK_IN", resource: "Booking", resourceId: booking._id });
      return { bookingId: booking._id };
    });

    if (result.error) return res.status(result.error).json({ message: result.message });
    const checkedIn = await Booking.findById(result.bookingId).populate("room", "roomNumber status");
    res.status(200).json({ message: "Guest checked in successfully", booking: checkedIn });
  } catch (error) {
    res.status(500).json({ message: "Failed to check in", error: error.message });
  }
};

const checkOutBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.status !== "checked_in") return res.status(400).json({ message: "Only checked-in bookings can be checked out" });

    const result = await withLock(`room:${String(booking.room)}`, async () => {
      booking.status = "checked_out";
      booking.actualCheckOut = new Date();
      if (booking.keyCard) {
        booking.keyCard.returnedAt = new Date();
        booking.keyCard.returnedBy = req.user._id;
      }
      pushStatusHistory(booking, "checked_out", req.user._id, "Guest checked out; key returned");
      await booking.save();

      await setRoomStatus(booking.room, "cleaning");
      await HousekeepingTask.create({
        room: booking.room,
        taskType: "turnover",
        priority: "high",
        status: "pending",
        scheduledAt: new Date(),
        notes: `Auto-generated after checkout of booking ${booking.confirmationCode}`,
        reportedBy: req.user._id,
      });

      let invoice = null;
      let billingError = null;
      try {
        const created = await createInvoiceForBooking({
          bookingId: booking._id,
          notes: "Auto-generated at check-out",
          createdBy: req.user._id,
        });
        invoice = created.invoice;
      } catch (error) {
        billingError = error.message;
      }

      const guest = await User.findById(booking.guest).select("name email");
      await createNotification({
        recipient: booking.guest,
        title: "Check-out Complete",
        message: `Thank you for staying with us.${invoice ? ` Invoice ${invoice.invoiceNumber} is ready.` : ""}`,
        type: "booking",
        relatedId: booking._id,
        emailHtml: templates.generic("Check-out Complete", `<p>Hello ${guest?.name || "Guest"},</p><p>Thank you for staying with us.${invoice ? ` Your invoice <strong>${invoice.invoiceNumber}</strong> is ready.</p>` : "</p>"} `),
      });
      await createNotification({
        recipientRole: "housekeeping",
        title: "Room Needs Cleaning",
        message: `Room associated with booking ${booking.confirmationCode} is ready for cleaning.`,
        type: "housekeeping",
        relatedId: booking._id,
      });
      await logAudit(req, { action: "CHECK_OUT", resource: "Booking", resourceId: booking._id });

      return { bookingId: booking._id, invoiceId: invoice?._id || null, billingError };
    });

    if (result.error) return res.status(result.error).json({ message: result.message });
    const checkedOut = await Booking.findById(result.bookingId).populate("room", "roomNumber status");
    res.status(200).json({
      message: "Guest checked out successfully",
      booking: checkedOut,
      invoiceId: result.invoiceId,
      ...(result.billingError ? { warning: result.billingError } : {}),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to check out", error: error.message });
  }
};

module.exports = {
  createBooking,
  getBookings,
  getBookingById,
  updateBooking,
  cancelBooking,
  checkInBooking,
  checkOutBooking,
};
