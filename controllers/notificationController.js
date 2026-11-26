const Notification = require("../models/Notification");
const User = require("../models/UserSchema");
const { logAudit } = require("../utils/auditLogger");
const { createNotification: deliverNotification } = require("../utils/notification");

const canAccessNotification = (notification, user) => {
  if (!notification) return false;
  if (notification.recipient && String(notification.recipient) === String(user._id)) return true;
  if (notification.recipientRole === "all") return true;
  if (notification.recipientRole && notification.recipientRole === user.role) return true;
  return false;
};

const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      $or: [
        { recipient: req.user._id },
        { recipientRole: req.user.role },
        { recipientRole: "all" },
      ],
    }).sort({ createdAt: -1 });

    res.status(200).json({ notifications });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch notifications", error: error.message });
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    if (!canAccessNotification(notification, req.user)) {
      return res.status(403).json({ message: "Access denied" });
    }

    notification.isRead = true;
    await notification.save();

    res.status(200).json({ message: "Notification marked as read", notification });
  } catch (error) {
    res.status(500).json({ message: "Failed to update notification", error: error.message });
  }
};

const markAllRead = async (req, res) => {
  try {
    await Notification.updateMany(
      {
        isRead: false,
        $or: [
          { recipient: req.user._id },
          { recipientRole: req.user.role },
          { recipientRole: "all" },
        ],
      },
      { $set: { isRead: true } }
    );

    res.status(200).json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update notifications", error: error.message });
  }
};

const createNotificationHandler = async (req, res) => {
  try {
    const delivery = await deliverNotification({
      recipient: req.body.recipient || null,
      recipientRole: req.body.recipientRole || "",
      title: req.body.title,
      message: req.body.message,
      type: req.body.type || "system",
      relatedId: req.body.relatedId || null,
    });

    await logAudit(req, {
      action: "CREATE_NOTIFICATION",
      resource: "Notification",
      details: { delivery, title: req.body.title },
    });

    res.status(201).json({ message: "Notification created successfully", delivery });
  } catch (error) {
    res.status(500).json({ message: "Failed to create notification", error: error.message });
  }
};

const getPreferences = async (req, res) => {
  res.status(200).json({ preferences: req.user.notificationPreferences });
};

const updatePreferences = async (req, res) => {
  try {
    const updates = {};
    ["email", "inApp", "types"].forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[`notificationPreferences.${field}`] = req.body[field];
      }
    });
    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true });
    await logAudit(req, { action: "UPDATE_NOTIFICATION_PREFERENCES", resource: "User", resourceId: user._id });
    res.status(200).json({ message: "Notification preferences updated", preferences: user.notificationPreferences });
  } catch (error) {
    res.status(500).json({ message: "Failed to update preferences", error: error.message });
  }
};

const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    if (!canAccessNotification(notification, req.user) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    await notification.deleteOne();
    res.status(200).json({ message: "Notification deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete notification", error: error.message });
  }
};

module.exports = {
  getMyNotifications,
  markNotificationRead,
  markAllRead,
  createNotification: createNotificationHandler,
  deleteNotification,
  getPreferences,
  updatePreferences,
};
