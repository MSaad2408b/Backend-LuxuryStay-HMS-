const Joi = require("joi");

const updateProfileSchema = Joi.object({
  name: Joi.string().trim().min(3).max(50),
  contact: Joi.string().trim().min(10).max(20),
  address: Joi.string().trim().min(5).max(200),
  preferences: Joi.string().trim().allow(""),
}).min(1);

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(100).required(),
});

const createStaffSchema = Joi.object({
  name: Joi.string().trim().min(3).max(50).required(),
  email: Joi.string().email().lowercase().trim().required(),
  address: Joi.string().trim().min(5).max(200).required(),
  contact: Joi.string().trim().min(10).max(20).required(),
  password: Joi.string().min(8).max(100).required(),
  role: Joi.string().valid("admin", "manager", "receptionist", "housekeeping", "guest").required(),
});

const updateUserSchema = Joi.object({
  name: Joi.string().trim().min(3).max(50),
  email: Joi.string().email().lowercase().trim(),
  address: Joi.string().trim().min(5).max(200),
  contact: Joi.string().trim().min(10).max(20),
  role: Joi.string().valid("admin", "manager", "receptionist", "housekeeping", "guest"),
  isActive: Joi.boolean(),
  preferences: Joi.string().trim().allow(""),
}).min(1);

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: Joi.string().min(8).max(100).required(),
});

const { PERMISSIONS } = require("../config/permissions");

const permissionsSchema = Joi.object({
  permissions: Joi.array().items(Joi.string().valid(...PERMISSIONS)).min(1).required(),
});

module.exports = {
  permissionsSchema,
  updateProfileSchema,
  changePasswordSchema,
  createStaffSchema,
  updateUserSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
