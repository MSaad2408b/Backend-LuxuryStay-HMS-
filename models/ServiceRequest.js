const mongoose = require("mongoose");

const serviceRequestSchema = new mongoose.Schema(
  {
    guest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
    serviceType: {
      type: String,
      enum: ["room_service", "wake_up_call", "transportation", "laundry", "other"],
      required: true,
    },
    details: {
      type: String,
      trim: true,
      required: true,
    },
    requestedFor: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "cancelled"],
      default: "pending",
    },
    handledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    completedAt: {
      type: Date,
      default: null,
    },
    cost: {
      type: Number,
      min: 0,
      default: 0,
    },
    billed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

serviceRequestSchema.index({ guest: 1, createdAt: -1 });
serviceRequestSchema.index({ status: 1, serviceType: 1 });

module.exports = mongoose.model("ServiceRequest", serviceRequestSchema);
