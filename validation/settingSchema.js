const Joi = require("joi");

const upsertSettingSchema = Joi.object({
  key: Joi.string().trim().required(),
  value: Joi.any().required(),
  description: Joi.string().trim().allow("").default(""),
});

module.exports = { upsertSettingSchema };
