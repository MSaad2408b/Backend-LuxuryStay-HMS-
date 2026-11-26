const Joi = require("joi");
const config = require("../config/env");

// Register Schema
const registerSchema = Joi.object({
  name: Joi.string().trim().min(3).max(50).required(),

  email: Joi.string().email().lowercase().trim().required(),

  address: Joi.string().trim().min(5).max(200).required(),

  contact: Joi.string().trim().min(10).max(20).required(),

  password: Joi.string().min(8).max(100).required(),

  acceptPrivacyPolicy: Joi.boolean().valid(true).default(true),

  acceptMarketing: Joi.boolean().default(false),

  privacyPolicyVersion: Joi.string().default(config.consentVersion),
});

// Login Schema
const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),

  password: Joi.string().required(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
};
