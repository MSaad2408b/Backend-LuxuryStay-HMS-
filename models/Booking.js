const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    guest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    checkInDate: {
      type: Date,
      required: true,
    },
    checkOutDate: {
      type: Date,
      required: true,
    },
    actualCheckIn: {
      type: Date,
      default: null,
    },
    actualCheckOut: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["reserved", "checked_in", "checked_out", "cancelled"],
      default: "reserved",
    },
    guestsCount: {
      type: Number,
      required: true,
      min: 1,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    specialRequests: {
      type: String,
      trim: true,
      default: "",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded", "partial"],
      default: "pending",
    },
    confirmationCode: {
      type: String,
      unique: true,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancellationReason: {
      type: String,
      trim: true,
      default: "",
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        note: { type: String, default: "" },
      },
    ],
    keyCard: {
      number: { type: String, default: null },
      issuedAt: { type: Date, default: null },
      issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      returnedAt: { type: Date, default: null },
      returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null },
  },
  { timestamps: true }
);

bookingSchema.index({ guest: 1, createdAt: -1 });
bookingSchema.index({ room: 1, status: 1, checkInDate: 1, checkOutDate: 1 });
bookingSchema.index({ status: 1, checkInDate: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
