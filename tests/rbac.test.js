const { app, request, createUser, login, auth, dateAfter, createRoom } = require("./helpers");

describe("Role-based access control, audit trail and privacy", () => {
  it("denies guests access to admin and room-management endpoints", async () => {
    const guest = await createUser({ email: "rbac-guest@example.com" });
    const guestToken = (await login(guest.email)).token;

    expect((await request(app).get("/api/users").set(auth(guestToken))).status).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/rooms")
          .set(auth(guestToken))
          .send({ roomNumber: "DENIED", type: "single", pricePerNight: 100, capacity: 2 })
      ).status
    ).toBe(403);
    expect((await request(app).get("/api/rooms").set(auth(guestToken))).status).toBe(200);
  });

  it("prevents a guest from reading another guest's booking", async () => {
    const admin = await createUser({ role: "admin", email: "rbac-admin@example.com" });
    const adminToken = (await login(admin.email)).token;
    const owner = await createUser({ email: "owner@example.com" });
    const other = await createUser({ email: "other@example.com" });
    const otherToken = (await login(other.email)).token;
    const room = await createRoom(adminToken, { roomNumber: "RBAC-ROOM" });

    const booking = await request(app)
      .post("/api/bookings")
      .set(auth(adminToken))
      .send({
        room: room._id.toString(),
        guest: owner._id.toString(),
        checkInDate: dateAfter(1),
        checkOutDate: dateAfter(2),
        guestsCount: 1,
      });
    expect(booking.status).toBe(201);

    const denied = await request(app)
      .get(`/api/bookings/${booking.body.booking._id}`)
      .set(auth(otherToken));
    expect(denied.status).toBe(403);
  });

  it("honours granular permissions assigned by an admin", async () => {
    const admin = await createUser({ role: "admin", email: "perm-admin@example.com" });
    const adminToken = (await login(admin.email)).token;
    const receptionist = await createUser({ role: "receptionist", email: "perm-receptionist@example.com" });

    const updated = await request(app)
      .put(`/api/users/${receptionist._id}/permissions`)
      .set(auth(adminToken))
      .send({ permissions: ["view_rooms"] });
    expect(updated.status).toBe(200);

    const token = (await login(receptionist.email)).token;
    expect((await request(app).get("/api/rooms").set(auth(token))).status).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/rooms")
          .set(auth(token))
          .send({ roomNumber: "NO-PERM", type: "single", pricePerNight: 100, capacity: 2 })
      ).status
    ).toBe(403);
  });

  it("records auditable actions", async () => {
    const admin = await createUser({ role: "admin", email: "audit-admin@example.com" });
    const token = (await login(admin.email)).token;
    await createRoom(token, { roomNumber: "AUDIT-ROOM" });

    const logs = await request(app).get("/api/audit-logs?action=CREATE_ROOM").set(auth(token));
    expect(logs.status).toBe(200);
    expect(logs.body.logs.length).toBeGreaterThan(0);
    expect(logs.body.logs[0].action).toBe("CREATE_ROOM");
  });

  it("exports and anonymizes personal data on request", async () => {
    const guest = await createUser({ email: "privacy-guest@example.com" });
    const token = (await login(guest.email)).token;

    const exported = await request(app).get("/api/privacy/export").set(auth(token));
    expect(exported.status).toBe(200);
    expect(Array.isArray(exported.body.bookings)).toBe(true);
    expect(exported.body.user.email).toBe(guest.email);

    const removed = await request(app)
      .delete("/api/privacy/me")
      .set(auth(token))
      .send({ confirm: "DELETE", reason: "No longer using the service" });
    expect(removed.status).toBe(200);

    const loginAgain = await request(app)
      .post("/api/auth/login")
      .send({ email: "privacy-guest@example.com", password: "Password123" });
    expect(loginAgain.status).toBe(401);
  });
});
