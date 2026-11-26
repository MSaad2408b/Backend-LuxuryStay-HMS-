const Joi = require("joi");

const createHousekeepingTaskSchema = Joi.object({
  room: Joi.string().hex().length(24).required(),
  assignedTo: Joi.string().hex().length(24).allow(null),
  taskType: Joi.string().valid("cleaning", "laundry", "inspection", "turnover", "other").default("cleaning"),
  priority: Joi.string().valid("low", "medium", "high").default("medium"),
  notes: Joi.string().trim().allow("").default(""),
  scheduledAt: Joi.date().iso().allow(null),
});

const updateHousekeepingTaskSchema = Joi.object({
  assignedTo: Joi.string().hex().length(24).allow(null),
  taskType: Joi.string().valid("cleaning", "laundry", "inspection", "turnover", "other"),
  status: Joi.string().valid("pending", "in_progress", "completed"),
  priority: Joi.string().valid("low", "medium", "high"),
  notes: Joi.string().trim().allow(""),
  scheduledAt: Joi.date().iso().allow(null),
}).min(1);

module.exports = { createHousekeepingTaskSchema, updateHousekeepingTaskSchema };
