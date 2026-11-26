const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
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
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      default: "",
    },
    category: {
      type: String,
      enum: ["service", "cleanliness", "room", "food", "staff", "overall"],
      default: "overall",
    },
    adminReply: {
      type: String,
      trim: true,
      default: "",
    },
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    repliedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

feedbackSchema.index({ guest: 1, createdAt: -1 });
feedbackSchema.index({ category: 1, rating: 1 });
feedbackSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Feedback", feedbackSchema);
