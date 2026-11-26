const crypto = require("crypto");
const bcrypt = require("bcrypt");
const User = require("../models/UserSchema");
const Booking = require("../models/Booking");
const Invoice = require("../models/Invoice");
const Feedback = require("../models/Feedback");
const ServiceRequest = require("../models/ServiceRequest");
const MaintenanceRequest = require("../models/MaintenanceRequest");
const Notification = require("../models/Notification");
const RefreshToken = require("../models/RefreshToken");
const TokenBlacklist = require("../models/TokenBlacklist");
const { logAudit } = require("../utils/auditLogger");
const { sanitizeUser } = require("./authcontroller");
const { getSetting } = require("../utils/settings");
const config = require("../config/env");

const getConsent = async (req, res) => {
  res.status(200).json({
    version: await getSetting("privacy_policy_version", config.consentVersion),
    consent: req.user.privacyConsent,
  });
};

const updateConsent = async (req, res) => {
  try {
    const { privacyPolicy, marketing, version } = req.body;
    const user = await User.findById(req.user._id);
    user.privacyConsent = {
      privacyPolicy: privacyPolicy !== false,
      marketing: Boolean(marketing),
      version: version || config.consentVersion,
      acceptedAt: privacyPolicy !== false ? new Date() : null,
      withdrawnAt: privacyPolicy === false ? new Date() : null,
    };
    await user.save();

    await logAudit(req, {
      action: "UPDATE_CONSENT",
      resource: "User",
      resourceId: user._id,
      details: { privacyPolicy: user.privacyConsent.privacyPolicy, version: user.privacyConsent.version },
    });

    res.status(200).json({ message: "Consent preferences updated", consent: user.privacyConsent });
  } catch (error) {
    res.status(500).json({ message: "Failed to update consent", error: error.message });
  }
};

const exportMyData = async (req, res) => {
  try {
    const userId = req.user._id;
    const [bookings, invoices, feedback, serviceRequests, maintenanceRequests, notifications] = await Promise.all([
      Booking.find({ guest: userId }).lean(),
      Invoice.find({ guest: userId }).lean(),
      Feedback.find({ guest: userId }).lean(),
      ServiceRequest.find({ guest: userId }).lean(),
      MaintenanceRequest.find({ reportedBy: userId }).lean(),
      Notification.find({ recipient: userId }).lean(),
    ]);

    await logAudit(req, { action: "DATA_EXPORT", resource: "User", resourceId: userId });

    res.status(200).json({
      exportedAt: new Date().toISOString(),
      format: "json",
      user: sanitizeUser(req.user),
      bookings,
      invoices,
      feedback,
      serviceRequests,
      maintenanceRequests,
      notifications,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to export personal data", error: error.message });
  }
};

const deleteMyData = async (req, res) => {
  try {
    const userId = req.user._id;
    await logAudit(req, {
      action: "DATA_DELETION_REQUEST",
      resource: "User",
      resourceId: userId,
      details: { reason: req.body.reason || "" },
    });

    const anonymousEmail = `deleted-${userId}@privacy.invalid`;
    const user = await User.findById(userId);
    user.name = "Deleted User";
    user.email = anonymousEmail;
    user.contact = "REDACTED";
    user.address = "REDACTED";
    user.preferences = "";
    user.password = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
    user.privacyConsent = {
      privacyPolicy: false,
      marketing: false,
      version: user.privacyConsent?.version || config.consentVersion,
      acceptedAt: null,
      withdrawnAt: new Date(),
    };
    user.isActive = false;
    user.anonymized = true;
    await user.save();

    await Promise.all([
      RefreshToken.deleteMany({ user: userId }),
      TokenBlacklist.deleteMany({ user: userId }),
      Notification.deleteMany({ recipient: userId }),
      Feedback.deleteMany({ guest: userId }),
      ServiceRequest.deleteMany({ guest: userId }),
      MaintenanceRequest.deleteMany({ reportedBy: userId }),
      Booking.updateMany({ guest: userId }, { $set: { specialRequests: "", cancellationReason: "" } }),
    ]);

    res.status(200).json({ message: "Personal data has been anonymized and removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete personal data", error: error.message });
  }
};

module.exports = { getConsent, updateConsent, exportMyData, deleteMyData };
