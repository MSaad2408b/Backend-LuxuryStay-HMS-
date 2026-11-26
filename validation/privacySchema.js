const Joi = require("joi");

const consentSchema = Joi.object({
  privacyPolicy: Joi.boolean().valid(true).required(),
  marketing: Joi.boolean(),
  version: Joi.string(),
}).min(1);

const deleteAccountSchema = Joi.object({
  confirm: Joi.string().valid("DELETE").required(),
  reason: Joi.string().trim().max(500).allow(""),
});

module.exports = { consentSchema, deleteAccountSchema };
