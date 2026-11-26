const Joi = require("joi");

const chargeItemSchema = Joi.object({
  description: Joi.string().trim().required(),
  amount: Joi.number().min(0).required(),
  type: Joi.string().valid("room", "food", "laundry", "service", "other").default("other"),
});

const createInvoiceSchema = Joi.object({
  booking: Joi.string().hex().length(24).required(),
  charges: Joi.array().items(chargeItemSchema).default([]),
  // Leave undefined when the client does not override it so the configured
  // system tax rate is applied by the invoice service.
  tax: Joi.number().min(0),
  discount: Joi.number().min(0).default(0),
  notes: Joi.string().trim().allow("").default(""),
});

const addChargeSchema = Joi.object({
  description: Joi.string().trim().required(),
  amount: Joi.number().min(0).required(),
  type: Joi.string().valid("room", "food", "laundry", "service", "other").default("other"),
});

const paymentSchema = Joi.object({
  paymentMethod: Joi.string().valid("cash", "card", "online", "bank_transfer").required(),
  paymentStatus: Joi.string().valid("paid", "partially_paid", "unpaid", "refunded").default("paid"),
});

module.exports = { createInvoiceSchema, addChargeSchema, paymentSchema };
