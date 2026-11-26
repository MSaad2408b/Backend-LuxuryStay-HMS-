const Joi = require("joi");

const createNotificationSchema = Joi.object({
  recipient: Joi.string().hex().length(24).allow(null, ""),
  recipientRole: Joi.string().valid("admin", "manager", "receptionist", "housekeeping", "guest", "all").allow(""),
  title: Joi.string().trim().min(1).max(150).required(),
  message: Joi.string().trim().min(1).max(1000).required(),
  type: Joi.string().valid("booking", "housekeeping", "maintenance", "service", "system", "general").default("system"),
  relatedId: Joi.string().hex().length(24).allow(null, ""),
}).or("recipient", "recipientRole");

module.exports = { createNotificationSchema };
