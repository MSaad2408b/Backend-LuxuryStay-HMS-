const Joi = require("joi");

const createMaintenanceRequestSchema = Joi.object({
  room: Joi.string().hex().length(24).required(),
  issue: Joi.string().trim().min(3).max(200).required(),
  description: Joi.string().trim().allow("").default(""),
  priority: Joi.string().valid("low", "medium", "high", "urgent").default("medium"),
});

const updateMaintenanceRequestSchema = Joi.object({
  assignedTo: Joi.string().hex().length(24).allow(null),
  issue: Joi.string().trim().min(3).max(200),
  description: Joi.string().trim().allow(""),
  priority: Joi.string().valid("low", "medium", "high", "urgent"),
  status: Joi.string().valid("pending", "in_progress", "resolved", "closed"),
  resolutionNotes: Joi.string().trim().allow(""),
}).min(1);

module.exports = { createMaintenanceRequestSchema, updateMaintenanceRequestSchema };
