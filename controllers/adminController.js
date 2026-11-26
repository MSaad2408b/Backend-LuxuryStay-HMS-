const mongoose = require("mongoose");
const User = require("../models/UserSchema");
const Room = require("../models/Room");
const Booking = require("../models/Booking");
const Invoice = require("../models/Invoice");
const MaintenanceRequest = require("../models/MaintenanceRequest");
const ServiceRequest = require("../models/ServiceRequest");
const HousekeepingTask = require("../models/HousekeepingTask");
const { getMetricsSnapshot } = require("../utils/logger");
const { runBackup } = require("../utils/backup");
const { logAudit } = require("../utils/auditLogger");

const getOverview = async (req, res) => {
  try {
    const [usersByRole, rooms, bookingsByStatus, revenue, openMaintenance, openServices, openTasks] = await Promise.all([
      User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
      Room.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Booking.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Invoice.aggregate([
        { $match: { paymentStatus: { $in: ["paid", "partially_paid"] } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      MaintenanceRequest.countDocuments({ status: { $in: ["pending", "in_progress"] } }),
      ServiceRequest.countDocuments({ status: { $in: ["pending", "in_progress"] } }),
      HousekeepingTask.countDocuments({ status: { $in: ["pending", "in_progress"] } }),
    ]);

    res.status(200).json({
      usersByRole,
      roomsByStatus: rooms,
      bookingsByStatus,
      totalRevenue: revenue[0]?.total || 0,
      openRequests: { maintenance: openMaintenance, services: openServices, housekeeping: openTasks },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch admin overview", error: error.message });
  }
};

const getHealth = async (req, res) => {
  const states = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  const state = mongoose.connection.readyState;
  const healthy = state === 1;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    database: states[state] || "unknown",
    ...getMetricsSnapshot(),
    timestamp: new Date().toISOString(),
  });
};

const getMetrics = async (req, res) => {
  res.status(200).json(getMetricsSnapshot());
};

const triggerBackup = async (req, res) => {
  const result = await runBackup();
  await logAudit(req, { action: "TRIGGER_BACKUP", resource: "System", details: { success: result.success } });
  res.status(result.success ? 200 : 502).json(result);
};

module.exports = { getOverview, getHealth, getMetrics, triggerBackup };
