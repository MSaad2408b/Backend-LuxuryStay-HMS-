const Booking = require("../models/Booking");
const MaintenanceRequest = require("../models/MaintenanceRequest");
const Room = require("../models/Room");
const { broadcastRoomStatus } = require("./eventBus");

const OPEN_MAINTENANCE = ["pending", "in_progress"];

/**
 * Works out what a room's status *should* be from the records that exist,
 * instead of blindly forcing "available".
 *
 * Housekeeping used to mark a room available the moment a task was completed,
 * even when a guest was still checked in or the room had an open maintenance
 * issue — the front desk then saw an occupied room as free.
 */
const deriveRoomStatus = async (roomId) => {
  const [checkedIn, openIssue, reserved] = await Promise.all([
    Booking.exists({ room: roomId, status: "checked_in" }),
    MaintenanceRequest.exists({ room: roomId, status: { $in: OPEN_MAINTENANCE } }),
    Booking.exists({ room: roomId, status: "reserved" }),
  ]);

  if (checkedIn) return "occupied";
  if (openIssue) return "maintenance";
  if (reserved) return "reserved";
  return "available";
};

/** Recomputes and persists a room status, broadcasting the change to SSE clients. */
const syncRoomStatus = async (roomId) => {
  const status = await deriveRoomStatus(roomId);
  const room = await Room.findByIdAndUpdate(roomId, { status }, { new: true });
  if (room) broadcastRoomStatus(room._id, room.status, { roomNumber: room.roomNumber });
  return room;
};

module.exports = { deriveRoomStatus, syncRoomStatus, OPEN_MAINTENANCE };
