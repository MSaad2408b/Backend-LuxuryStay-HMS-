const User = require("../models/UserSchema");
const Notification = require("../models/Notification");
const { sendEmail, templates } = require("./email");
const { getEmailNotificationsEnabled } = require("./settings");
const { logger } = require("./logger");

const createNotification = async ({ recipient, recipientRole, title, message, type, relatedId, emailHtml }) => {
  try {
    const query = { isActive: true };
    if (recipient) query._id = recipient;
    else if (recipientRole) {
      if (recipientRole === "all") delete query.role;
      else query.role = recipientRole;
    } else return { notified: 0 };

    const users = await User.find(query)
      .select("email notificationPreferences privacyConsent")
      .lean();

    const emailEnabled = await getEmailNotificationsEnabled();
    let deliveredEmail = 0;

    await Promise.all(
      users.map(async (user) => {
        const prefs = user.notificationPreferences || {};
        const allowedTypes = prefs.types || [];
        const typeAllowed = !allowedTypes.length || allowedTypes.includes(type) || type === "system";

        if (prefs.inApp !== false && typeAllowed && (prefs.inApp === true || prefs.inApp === undefined)) {
          await Notification.create({
            recipient: user._id,
            recipientRole: "",
            title,
            message,
            type: type || "general",
            relatedId: relatedId || null,
          });
        }

        if (emailEnabled && prefs.email !== false && typeAllowed) {
          const result = await sendEmail({
            to: user.email,
            subject: `${title} - LuxuryStay HMS`,
            html: emailHtml || templates.generic(title, `<p>${message}</p>`),
          });
          if (result.delivered) deliveredEmail += 1;
        }
      })
    );

    return { notified: users.length, emailsDelivered: deliveredEmail };
  } catch (error) {
    logger.error("notification_failed", { error: error.message, title });
    return { notified: 0, error: error.message };
  }
};

const notifyManagers = (payload) => createNotification({ ...payload, recipientRole: "manager" });

module.exports = { createNotification, notifyManagers };
