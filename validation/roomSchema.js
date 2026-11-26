const Joi = require("joi");

const createRoomSchema = Joi.object({
  roomNumber: Joi.string().trim().required(),
  type: Joi.string().valid("single", "double", "suite", "deluxe", "family").required(),
  description: Joi.string().trim().allow("").default(""),
  pricePerNight: Joi.number().min(0).required(),
  capacity: Joi.number().integer().min(1).required(),
  amenities: Joi.array().items(Joi.string().trim()).default([]),
  floor: Joi.number().integer().min(0).default(0),
  status: Joi.string()
    .valid("available", "occupied", "cleaning", "maintenance", "reserved")
    .default("available"),
});

const updateRoomSchema = Joi.object({
  roomNumber: Joi.string().trim(),
  type: Joi.string().valid("single", "double", "suite", "deluxe", "family"),
  description: Joi.string().trim().allow(""),
  pricePerNight: Joi.number().min(0),
  capacity: Joi.number().integer().min(1),
  amenities: Joi.array().items(Joi.string().trim()),
  floor: Joi.number().integer().min(0),
  status: Joi.string().valid("available", "occupied", "cleaning", "maintenance", "reserved"),
  isActive: Joi.boolean(),
}).min(1);

const updateRoomStatusSchema = Joi.object({
  status: Joi.string()
    .valid("available", "occupied", "cleaning", "maintenance", "reserved")
    .required(),
});

module.exports = { createRoomSchema, updateRoomSchema, updateRoomStatusSchema };
