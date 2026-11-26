const Joi = require("joi");

const createServiceRequestSchema = Joi.object({
  booking: Joi.string().hex().length(24).allow(null),
  serviceType: Joi.string().valid("room_service", "wake_up_call", "transportation", "laundry", "other").required(),
  details: Joi.string().trim().min(3).max(500).required(),
  requestedFor: Joi.date().iso().allow(null),
});

const updateServiceRequestSchema = Joi.object({
  status: Joi.string().valid("pending", "in_progress", "completed", "cancelled"),
  handledBy: Joi.string().hex().length(24).allow(null),
  notes: Joi.string().trim().allow(""),
  cost: Joi.number().min(0),
}).min(1);

module.exports = { createServiceRequestSchema, updateServiceRequestSchema };
