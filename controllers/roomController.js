const Room = require("../models/Room");
const Booking = require("../models/Booking");
const { logAudit } = require("../utils/auditLogger");
const { subscribe, broadcastRoomStatus } = require("../utils/eventBus");

const createRoom = async (req, res) => {
  try {
    const existingRoom = await Room.findOne({ roomNumber: req.body.roomNumber.trim() });
    if (existingRoom) return res.status(409).json({ message: "Room number already exists" });

    const room = await Room.create(req.body);
    broadcastRoomStatus(room._id, room.status, { roomNumber: room.roomNumber });
    await logAudit(req, { action: "CREATE_ROOM", resource: "Room", resourceId: room._id, details: { roomNumber: room.roomNumber } });
    res.status(201).json({ message: "Room created successfully", room });
  } catch (error) {
    // Two requests can pass the duplicate check at the same time; the unique
    // index is the real guard, so report the conflict instead of a 500.
    if (error.code === 11000) {
      return res.status(409).json({ message: "Room number already exists" });
    }
    res.status(500).json({ message: "Failed to create room", error: error.message });
  }
};

const getRooms = async (req, res) => {
  try {
    const { status, type, isActive, minPrice, maxPrice } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (minPrice || maxPrice) {
      filter.pricePerNight = {};
      if (minPrice) filter.pricePerNight.$gte = Number(minPrice);
      if (maxPrice) filter.pricePerNight.$lte = Number(maxPrice);
    }

    const rooms = await Room.find(filter).sort({ roomNumber: 1 });
    res.status(200).json({ rooms });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch rooms", error: error.message });
  }
};

const getRoomById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found" });
    res.status(200).json({ room });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch room", error: error.message });
  }
};

const updateRoom = async (req, res) => {
  try {
    if (req.body.roomNumber) {
      const existing = await Room.findOne({
        roomNumber: req.body.roomNumber.trim(),
        _id: { $ne: req.params.id },
      });
      if (existing) return res.status(409).json({ message: "Room number already exists" });
    }

    const room = await Room.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!room) return res.status(404).json({ message: "Room not found" });

    if (req.body.status) broadcastRoomStatus(room._id, room.status, { roomNumber: room.roomNumber });
    await logAudit(req, { action: "UPDATE_ROOM", resource: "Room", resourceId: room._id, details: { fields: Object.keys(req.body) } });
    res.status(200).json({ message: "Room updated successfully", room });
  } catch (error) {
    res.status(500).json({ message: "Failed to update room", error: error.message });
  }
};

const updateRoomStatus = async (req, res) => {
  try {
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true, runValidators: true }
    );
    if (!room) return res.status(404).json({ message: "Room not found" });

    broadcastRoomStatus(room._id, room.status, { roomNumber: room.roomNumber });
    await logAudit(req, {
      action: "UPDATE_ROOM_STATUS",
      resource: "Room",
      resourceId: room._id,
      details: { status: room.status },
    });
    res.status(200).json({ message: "Room status updated successfully", room });
  } catch (error) {
    res.status(500).json({ message: "Failed to update room status", error: error.message });
  }
};

const deleteRoom = async (req, res) => {
  try {
    const room = await Room.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!room) return res.status(404).json({ message: "Room not found" });

    broadcastRoomStatus(room._id, "unavailable", { roomNumber: room.roomNumber, isActive: false });
    await logAudit(req, { action: "DEACTIVATE_ROOM", resource: "Room", resourceId: room._id });
    res.status(200).json({ message: "Room deactivated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete room", error: error.message });
  }
};

const getAvailableRooms = async (req, res) => {
  try {
    const { checkInDate, checkOutDate, type, guests } = req.query;
    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({ message: "checkInDate and checkOutDate are required" });
    }

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
      return res.status(400).json({ message: "Invalid date range" });
    }

    const overlappingBookings = await Booking.find({
      status: { $in: ["reserved", "checked_in"] },
      checkInDate: { $lt: checkOut },
      checkOutDate: { $gt: checkIn },
    }).select("room").lean();

    const bookedRoomIds = overlappingBookings.map((b) => b.room);
    const filter = {
      isActive: true,
      status: { $ne: "maintenance" },
      _id: { $nin: bookedRoomIds },
    };
    if (type) filter.type = type;
    if (guests) filter.capacity = { $gte: Number(guests) };

    const rooms = await Room.find(filter).sort({ roomNumber: 1 });
    res.status(200).json({ rooms, count: rooms.length });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch available rooms", error: error.message });
  }
};

const getRoomStats = async (req, res) => {
  try {
    const stats = await Room.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          averagePrice: { $avg: "$pricePerNight" },
        },
      },
    ]);
    res.status(200).json({ stats });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch room statistics", error: error.message });
  }
};

const streamRoomStatus = (req, res) => {
  subscribe(req, res);
};

module.exports = {
  createRoom,
  getRooms,
  getRoomById,
  updateRoom,
  updateRoomStatus,
  deleteRoom,
  getAvailableRooms,
  getRoomStats,
  streamRoomStatus,
};
