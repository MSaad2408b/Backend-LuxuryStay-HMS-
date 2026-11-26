const mongoose = require("mongoose");
const { app, request, PASSWORD, createUser, login, auth, dateAfter, createRoom } = require("./helpers");
const User = require("../models/UserSchema");

describe("Authentication, encryption and consent", () => {
  it("registers a guest with consent and encrypts PII at rest", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "New Guest",
      email: "newguest@example.com",
      contact: "9876543210",
      address: "123 Luxury Lane",
      password: PASSWORD,
    });

    expect(response.status).toBe(201);
    expect(response.body.user.privacyConsent.privacyPolicy).toBe(true);
    expect(response.body.user.contact).toBe("9876543210");

    const raw = await mongoose.connection.collection("users").findOne({ email: "newguest@example.com" });
    expect(raw.contact).toMatch(/^enc:v1:/);
    expect(raw.address).toMatch(/^enc:v1:/);
    expect(raw.password).not.toBe(PASSWORD);
  });

  it("issues access + refresh tokens and rotates refresh tokens", async () => {
    const user = await createUser({ role: "guest", email: "rotate@example.com" });
    const session = await login(user.email);

    expect(session.token).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();

    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: session.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.token).toBeTruthy();

    const reuse = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: session.refreshToken });
    expect(reuse.status).toBe(401);
  });

  it("revokes the access token on logout", async () => {
    const user = await createUser({ role: "guest", email: "logout@example.com" });
    const session = await login(user.email);

    const logout = await request(app)
      .post("/api/auth/logout")
      .set(auth(session.token))
      .send({ refreshToken: session.refreshToken });
    expect(logout.status).toBe(200);

    const me = await request(app).get("/api/auth/me").set(auth(session.token));
    expect(me.status).toBe(401);
  });

  it("blocks inactive users at login", async () => {
    const user = await createUser({ email: "inactive@example.com" });
    user.isActive = false;
    await user.save();

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: PASSWORD });
    expect(response.status).toBe(403);
  });

  it("requires privacy consent before creating a booking", async () => {
    const guest = await createUser({ email: "noconsent@example.com", consent: false });
    const session = await login(guest.email);

    const response = await request(app)
      .post("/api/bookings")
      .set(auth(session.token))
      .send({
        room: "507f1f77bcf86cd799439011",
        checkInDate: dateAfter(2),
        checkOutDate: dateAfter(4),
        guestsCount: 2,
      });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/consent/i);
  });

  it("encrypts PII but keeps decrypted values in API responses", async () => {
    const user = await createUser({
      email: "pii@example.com",
      contact: "9998887777",
      address: "77 Palace Road",
    });
    const session = await login(user.email);
    const me = await request(app).get("/api/auth/me").set(auth(session.token));

    expect(me.status).toBe(200);
    expect(me.body.user.contact).toBe("9998887777");
    expect(me.body.user.address).toBe("77 Palace Road");
    expect(me.body.user.password).toBeUndefined();
  });
});
