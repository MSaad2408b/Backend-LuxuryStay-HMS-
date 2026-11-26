const Feedback = require("../models/Feedback");
const { logAudit } = require("../utils/auditLogger");
const Booking = require("../models/Booking");
const { createNotification } = require("../utils/notification");

const createFeedback = async (req, res) => {
  try {
    if (req.body.booking) {
      const booking = await Booking.findById(req.body.booking).lean();
      if (!booking || String(booking.guest) !== String(req.user._id)) {
        return res.status(403).json({ message: "You can only leave feedback for your own booking" });
      }
    }

    const feedback = await Feedback.create({
      ...req.body,
      guest: req.user._id,
    });

    await createNotification({
      recipientRole: "manager",
      title: "New Guest Feedback",
      message: `A guest submitted ${req.body.rating}-star feedback (${req.body.category || "overall"}).`,
      type: "system",
      relatedId: feedback._id,
    });

    const populatedFeedback = await Feedback.findById(feedback._id)
      .populate("guest", "name email")
      .populate("booking", "confirmationCode checkInDate checkOutDate")
      .populate("repliedBy", "name email role");

    res.status(201).json({ message: "Feedback submitted successfully", feedback: populatedFeedback });
  } catch (error) {
    res.status(500).json({ message: "Failed to submit feedback", error: error.message });
  }
};

const getFeedback = async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.rating) filter.rating = Number(req.query.rating);

    const feedback = await Feedback.find(filter)
      .populate("guest", "name email")
      .populate("booking", "confirmationCode checkInDate checkOutDate")
      .populate("repliedBy", "name email role")
      .sort({ createdAt: -1 });

    res.status(200).json({ feedback });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch feedback", error: error.message });
  }
};

const replyToFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) {
      return res.status(404).json({ message: "Feedback not found" });
    }

    feedback.adminReply = req.body.adminReply;
    feedback.repliedBy = req.user._id;
    feedback.repliedAt = new Date();
    await feedback.save();

    // The guest had no way of learning that management responded.
    await createNotification({
      recipient: feedback.guest,
      title: "Reply to your feedback",
      message: `Our team replied to your feedback: "${feedback.adminReply}"`,
      type: "system",
      relatedId: feedback._id,
    });

    await logAudit(req, { action: "REPLY_FEEDBACK", resource: "Feedback", resourceId: feedback._id });

    const populatedFeedback = await Feedback.findById(feedback._id)
      .populate("guest", "name email")
      .populate("booking", "confirmationCode checkInDate checkOutDate")
      .populate("repliedBy", "name email role");

    res.status(200).json({ message: "Reply submitted successfully", feedback: populatedFeedback });
  } catch (error) {
    res.status(500).json({ message: "Failed to submit reply", error: error.message });
  }
};

module.exports = { createFeedback, getFeedback, replyToFeedback };
