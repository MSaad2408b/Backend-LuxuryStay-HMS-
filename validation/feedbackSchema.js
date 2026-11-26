const Joi = require("joi");

const createFeedbackSchema = Joi.object({
  booking: Joi.string().hex().length(24).allow(null),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().trim().allow("").default(""),
  category: Joi.string().valid("service", "cleanliness", "room", "food", "staff", "overall").default("overall"),
});

const replyFeedbackSchema = Joi.object({
  adminReply: Joi.string().trim().min(1).max(1000).required(),
});

module.exports = { createFeedbackSchema, replyFeedbackSchema };
