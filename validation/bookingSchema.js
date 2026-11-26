const Joi = require("joi");

const createBookingSchema = Joi.object({
  guest: Joi.string().hex().length(24).allow("", null),
  room: Joi.string().hex().length(24),
  roomId: Joi.string().hex().length(24),
  checkInDate: Joi.date().iso().required(),
  checkOutDate: Joi.date().iso().greater(Joi.ref("checkInDate")).required(),
  guestsCount: Joi.number().integer().min(1).required(),
  specialRequests: Joi.string().trim().allow("").default(""),
}).or("room", "roomId");

const updateBookingSchema = Joi.object({
  room: Joi.string().hex().length(24),
  checkInDate: Joi.date().iso(),
  checkOutDate: Joi.date().iso(),
  guestsCount: Joi.number().integer().min(1),
  specialRequests: Joi.string().trim().allow(""),
  // Lifecycle status is intentionally excluded: check-in, check-out and
  // cancel have dedicated endpoints that keep the room and invoice in sync.
  paymentStatus: Joi.string().valid("pending", "paid", "refunded", "partial"),
}).min(1);

const cancelBookingSchema = Joi.object({
  reason: Joi.string().trim().max(500).allow(""),
  cancellationReason: Joi.string().trim().max(500).allow(""),
});

module.exports = { createBookingSchema, updateBookingSchema, cancelBookingSchema };
