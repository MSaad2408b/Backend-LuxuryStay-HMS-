const MaintenanceRequest = require("../models/MaintenanceRequest");
const Room = require("../models/Room");
const User = require("../models/UserSchema");
const { createNotification } = require("../utils/notification");
const { logAudit } = require("../utils/auditLogger");
const { broadcastRoomStatus } = require("../utils/eventBus");
const { syncRoomStatus } = require("../utils/roomStatus");
const { sendEmail, templates } = require("../utils/email");

const createMaintenanceRequest = async (req, res) => {
  try {
    const room = await Room.findById(req.body.room);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const request = await MaintenanceRequest.create({
      ...req.body,
      reportedBy: req.user._id,
    });

    await createNotification({
      recipientRole: "manager",
      title: "New Maintenance Request",
      message: `A maintenance issue was reported for room ${room.roomNumber}.`,
      type: "maintenance",
      relatedId: request._id,
    });

    const populatedRequest = await MaintenanceRequest.findById(request._id)
      .populate("room", "roomNumber type status")
      .populate("reportedBy", "name email role")
      .populate("assignedTo", "name email role");

    await logAudit(req, { action: "CREATE_MAINTENANCE", resource: "MaintenanceRequest", resourceId: request._id });

    res.status(201).json({ message: "Maintenance request created successfully", request: populatedRequest });
  } catch (error) {
    res.status(500).json({ message: "Failed to create maintenance request", error: error.message });
  }
};

const getMaintenanceRequests = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.room) filter.room = req.query.room;
    if (req.query.priority) filter.priority = req.query.priority;

    if (req.user.role === "guest") {
      filter.reportedBy = req.user._id;
    }

    const requests = await MaintenanceRequest.find(filter)
      .populate("room", "roomNumber type status")
      .populate("reportedBy", "name email role")
      .populate("assignedTo", "name email role")
      .sort({ createdAt: -1 });

    res.status(200).json({ requests });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch maintenance requests", error: error.message });
  }
};

const updateMaintenanceRequest = async (req, res) => {
  try {
    const request = await MaintenanceRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Maintenance request not found" });
    }

    Object.assign(request, req.body);

    if (req.body.status === "resolved" || req.body.status === "closed") {
      request.resolvedAt = new Date();
    } else if (req.body.status) {
      // Re-opened request: clear the previous resolution timestamp.
      request.resolvedAt = null;
    }

    // Persist before deriving the room status, otherwise the request being
    // resolved still counts as an open issue for its own room.
    await request.save();

    if (req.body.assignedTo) {
      await createNotification({
        recipient: req.body.assignedTo,
        title: "Maintenance Request Assigned",
        message: `You were assigned a ${request.priority} priority issue for room ${request.room}: ${request.issue}`,
        type: "maintenance",
        relatedId: request._id,
      });
    }

    if (req.body.status === "in_progress") {
      const room = await Room.findByIdAndUpdate(request.room, { status: "maintenance" }, { new: true });
      if (room) broadcastRoomStatus(room._id, room.status, { roomNumber: room.roomNumber });
    }

    if (req.body.status === "resolved" || req.body.status === "closed") {
      // Other open issues and current occupancy decide the room status; it is
      // not automatically free just because this ticket was closed.
      await syncRoomStatus(request.room);

      const reporter = await User.findById(request.reportedBy).select("name email");
      if (reporter?.email) {
        await sendEmail({
          to: reporter.email,
          subject: `Maintenance Request ${request.status}`,
          html: templates.generic(
            `Maintenance Request ${request.status}`,
            `<p>Hello ${reporter.name},</p><p>Your maintenance request for room issue "${request.issue}" has been ${request.status}.</p>`
          ),
        });
      }
    }

    const updatedRequest = await MaintenanceRequest.findById(request._id)
      .populate("room", "roomNumber type status")
      .populate("reportedBy", "name email role")
      .populate("assignedTo", "name email role");

    await logAudit(req, { action: "UPDATE_MAINTENANCE", resource: "MaintenanceRequest", resourceId: request._id, details: { status: request.status } });

    res.status(200).json({ message: "Maintenance request updated successfully", request: updatedRequest });
  } catch (error) {
    res.status(500).json({ message: "Failed to update maintenance request", error: error.message });
  }
};

module.exports = {
  createMaintenanceRequest,
  getMaintenanceRequests,
  updateMaintenanceRequest,
};
