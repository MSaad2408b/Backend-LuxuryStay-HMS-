const Joi = require("joi");

const notificationPreferenceSchema = Joi.object({
  email: Joi.boolean(),
  inApp: Joi.boolean(),
  types: Joi.array().items(
    Joi.string().valid("booking", "maintenance", "housekeeping", "service", "system", "general")
  ),
}).min(1);

module.exports = { notificationPreferenceSchema };
