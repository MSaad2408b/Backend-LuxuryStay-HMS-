const HousekeepingTask = require("../models/HousekeepingTask");
const Room = require("../models/Room");
const { createNotification } = require("../utils/notification");
const { logAudit } = require("../utils/auditLogger");
const { broadcastRoomStatus } = require("../utils/eventBus");
const { syncRoomStatus } = require("../utils/roomStatus");

const createTask = async (req, res) => {
  try {
    const room = await Room.findById(req.body.room);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const task = await HousekeepingTask.create({
      ...req.body,
      reportedBy: req.user._id,
    });

    if (req.body.assignedTo) {
      await createNotification({
        recipient: req.body.assignedTo,
        title: "New Housekeeping Task",
        message: `You have been assigned a ${task.taskType} task for room ${room.roomNumber}.`,
        type: "housekeeping",
        relatedId: task._id,
      });
    }

    const populatedTask = await HousekeepingTask.findById(task._id)
      .populate("room", "roomNumber type status")
      .populate("assignedTo", "name email role")
      .populate("reportedBy", "name email role");

    await logAudit(req, { action: "CREATE_HOUSEKEEPING_TASK", resource: "HousekeepingTask", resourceId: task._id });

    res.status(201).json({ message: "Housekeeping task created successfully", task: populatedTask });
  } catch (error) {
    res.status(500).json({ message: "Failed to create housekeeping task", error: error.message });
  }
};

const getTasks = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.room) filter.room = req.query.room;

    if (req.user.role === "housekeeping") {
      // Housekeepers must see the shared queue as well as their own work:
      // turnover tasks created by check-out have no assignee yet, so an
      // assigned-only filter left the board empty.
      filter.$or = [{ assignedTo: req.user._id }, { assignedTo: null }];
    } else if (req.query.assignedTo) {
      filter.assignedTo = req.query.assignedTo;
    }

    const tasks = await HousekeepingTask.find(filter)
      .populate("room", "roomNumber type status")
      .populate("assignedTo", "name email role")
      .populate("reportedBy", "name email role")
      .sort({ createdAt: -1 });

    res.status(200).json({ tasks });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch housekeeping tasks", error: error.message });
  }
};

const updateTask = async (req, res) => {
  try {
    const task = await HousekeepingTask.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: "Housekeeping task not found" });
    }

    if (req.user.role === "housekeeping") {
      // A task that already belongs to another housekeeper is off limits,
      // but unassigned tasks can be claimed from the shared queue.
      if (task.assignedTo && String(task.assignedTo) !== String(req.user._id)) {
        return res.status(403).json({ message: "Access denied" });
      }
      // Housekeepers claim work; they do not reassign it to someone else.
      delete req.body.assignedTo;
      if (!task.assignedTo) task.assignedTo = req.user._id;
    }

    Object.assign(task, req.body);

    if (req.body.status === "completed") {
      task.completedAt = new Date();
    } else if (req.body.status) {
      task.completedAt = null;
    }

    await task.save();

    if (req.body.status === "completed") {
      // Recompute instead of forcing "available": the guest may still be in
      // the room, or an open maintenance issue may keep it out of service.
      await syncRoomStatus(task.room);
    } else if (req.body.status === "in_progress") {
      const room = await Room.findById(task.room);
      if (room && !["occupied", "maintenance", "cleaning"].includes(room.status)) {
        room.status = "cleaning";
        await room.save();
        broadcastRoomStatus(room._id, room.status, { roomNumber: room.roomNumber });
      }
    }

    const updatedTask = await HousekeepingTask.findById(task._id)
      .populate("room", "roomNumber type status")
      .populate("assignedTo", "name email role")
      .populate("reportedBy", "name email role");

    await logAudit(req, { action: "UPDATE_HOUSEKEEPING_TASK", resource: "HousekeepingTask", resourceId: task._id, details: { status: task.status } });

    res.status(200).json({ message: "Housekeeping task updated successfully", task: updatedTask });
  } catch (error) {
    res.status(500).json({ message: "Failed to update housekeeping task", error: error.message });
  }
};

module.exports = { createTask, getTasks, updateTask };
