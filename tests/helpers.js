const request = require("supertest");
const bcrypt = require("bcrypt");
const { app } = require("../app");
const User = require("../models/UserSchema");

const PASSWORD = "Password123";

const createUser = async (overrides = {}) => {
  const role = overrides.role || "guest";
  const email = overrides.email || `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  return User.create({
    name: overrides.name || `${role} User`,
    email,
    contact: overrides.contact || "9876543210",
    address: overrides.address || "123 Luxury Lane",
    password: await bcrypt.hash(overrides.password || PASSWORD, 10),
    role,
    privacyConsent: {
      privacyPolicy: overrides.consent !== false,
      marketing: false,
      version: "v1.0",
      acceptedAt: overrides.consent === false ? null : new Date(),
    },
  });
};

const login = async (email, password = PASSWORD) => {
  const response = await request(app).post("/api/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  return {
    token: response.body.token,
    refreshToken: response.body.refreshToken,
    user: response.body.user,
  };
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const dateAfter = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const createRoom = async (token, overrides = {}) => {
  const response = await request(app)
    .post("/api/rooms")
    .set(auth(token))
    .send({
      roomNumber: overrides.roomNumber || `R-${Date.now()}`,
      type: overrides.type || "deluxe",
      pricePerNight: overrides.pricePerNight || 1000,
      capacity: overrides.capacity || 4,
      status: "available",
    });
  expect(response.status).toBe(201);
  return response.body.room;
};

module.exports = { app, request, PASSWORD, createUser, login, auth, dateAfter, createRoom };
