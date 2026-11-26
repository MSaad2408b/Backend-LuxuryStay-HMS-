const mongoose = require("mongoose");

const housekeepingTaskSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    taskType: {
      type: String,
      enum: ["cleaning", "laundry", "inspection", "turnover", "other"],
      default: "cleaning",
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed"],
      default: "pending",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

housekeepingTaskSchema.index({ room: 1, status: 1 });
housekeepingTaskSchema.index({ assignedTo: 1, status: 1 });
housekeepingTaskSchema.index({ scheduledAt: 1, status: 1 });

module.exports = mongoose.model("HousekeepingTask", housekeepingTaskSchema);
