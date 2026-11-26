const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    roomNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["single", "double", "suite", "deluxe", "family"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    pricePerNight: {
      type: Number,
      required: true,
      min: 0,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
    },
    amenities: {
      type: [String],
      default: [],
    },
    floor: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["available", "occupied", "cleaning", "maintenance", "reserved"],
      default: "available",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

roomSchema.index({ status: 1, isActive: 1 });
roomSchema.index({ type: 1, pricePerNight: 1 });

module.exports = mongoose.model("Room", roomSchema);
