const Room = require("../models/Room");
const User = require("../models/UserSchema");
const { permissionsForRole } = require("../config/permissions");
const { app, request, createUser, login, auth, dateAfter, createRoom } = require("./helpers");

/**
 * Regression guards for bugs found while auditing the API end to end.
 * Each test maps to a concrete failure that the original suite did not cover.
 */
describe("Regression guards", () => {
  it("answers 400 instead of 500 for malformed resource ids", async () => {
    const admin = await createUser({ role: "admin", email: "reg-admin@example.com" });
    const token = (await login(admin.email)).token;

    const room = await request(app).get("/api/rooms/not-an-id").set(auth(token));
    expect(room.status).toBe(400);
    expect(room.body.message).toMatch(/invalid/i);

    expect((await request(app).get("/api/bookings/not-an-id").set(auth(token))).status).toBe(400);
    expect((await request(app).get("/api/invoices/not-an-id").set(auth(token))).status).toBe(400);
    expect(
      (await request(app).put("/api/users/not-an-id").set(auth(token)).send({ name: "No One" })).status
    ).toBe(400);
  });

  it("recomputes permissions when an admin changes a user's role", async () => {
    const admin = await createUser({ role: "admin", email: "reg-role-admin@example.com" });
    const token = (await login(admin.email)).token;
    const guest = await createUser({ role: "guest", email: "reg-promote@example.com" });

    const promoted = await request(app)
      .put(`/api/users/${guest._id}`)
      .set(auth(token))
      .send({ role: "receptionist" });
    expect(promoted.status).toBe(200);

    const stored = await request(app).get(`/api/users/${guest._id}`).set(auth(token));
    expect(stored.body.user.permissions.sort()).toEqual(permissionsForRole("receptionist").sort());

    // The new role must actually unlock receptionist endpoints.
    const receptionToken = (await login(guest.email)).token;
    const bookings = await request(app).get("/api/bookings").set(auth(receptionToken));
    expect(bookings.status).toBe(200);
    expect(
      (await request(app).get("/api/users/guests").set(auth(receptionToken))).status
    ).toBe(200);
  });

  it("shows unassigned turnover tasks to housekeepers and lets them claim and finish them", async () => {
    const admin = await createUser({ role: "admin", email: "reg-hk-admin@example.com" });
    const adminToken = (await login(admin.email)).token;
    const housekeeper = await createUser({ role: "housekeeping", email: "reg-hk@example.com" });
    const hkToken = (await login(housekeeper.email)).token;
    const room = await createRoom(adminToken, { roomNumber: "REG-HK-1" });

    const created = await request(app)
      .post("/api/housekeeping")
      .set(auth(adminToken))
      .send({ room: room._id.toString(), taskType: "turnover", priority: "high" });
    expect(created.status).toBe(201);
    const taskId = created.body.task._id;

    const board = await request(app).get("/api/housekeeping").set(auth(hkToken));
    expect(board.status).toBe(200);
    expect(board.body.tasks.map((task) => task._id)).toContain(taskId);

    const started = await request(app)
      .put(`/api/housekeeping/${taskId}`)
      .set(auth(hkToken))
      .send({ status: "in_progress" });
    expect(started.status).toBe(200);
    expect(String(started.body.task.assignedTo._id || started.body.task.assignedTo)).toBe(String(housekeeper._id));

    const completed = await request(app)
      .put(`/api/housekeeping/${taskId}`)
      .set(auth(hkToken))
      .send({ status: "completed" });
    expect(completed.status).toBe(200);

    const refreshed = await Room.findById(room._id);
    expect(refreshed.status).toBe("available");
  });

  it("keeps a room occupied when housekeeping finishes a task while the guest is in-house", async () => {
    const admin = await createUser({ role: "admin", email: "reg-occ-admin@example.com" });
    const adminToken = (await login(admin.email)).token;
    const guest = await createUser({ email: "reg-occ-guest@example.com" });
    const guestToken = (await login(guest.email)).token;
    const housekeeper = await createUser({ role: "housekeeping", email: "reg-occ-hk@example.com" });
    const hkToken = (await login(housekeeper.email)).token;
    const room = await createRoom(adminToken, { roomNumber: "REG-OCC-1" });

    const booking = await request(app)
      .post("/api/bookings")
      .set(auth(guestToken))
      .send({
        room: room._id.toString(),
        checkInDate: dateAfter(1),
        checkOutDate: dateAfter(3),
        guestsCount: 1,
      });
    expect(booking.status).toBe(201);

    expect(
      (await request(app).patch(`/api/bookings/${booking.body.booking._id}/check-in`).set(auth(adminToken))).status
    ).toBe(200);

    const task = await request(app)
      .post("/api/housekeeping")
      .set(auth(adminToken))
      .send({ room: room._id.toString(), taskType: "cleaning", priority: "low" });

    const completed = await request(app)
      .put(`/api/housekeeping/${task.body.task._id}`)
      .set(auth(hkToken))
      .send({ status: "completed" });
    expect(completed.status).toBe(200);

    // The guest is still checked in: the room must not be advertised as free.
    const refreshed = await Room.findById(room._id);
    expect(refreshed.status).toBe("occupied");
  });

  it("refuses to cancel a booking whose guest has already checked in", async () => {
    const admin = await createUser({ role: "admin", email: "reg-cancel-admin@example.com" });
    const adminToken = (await login(admin.email)).token;
    const guest = await createUser({ email: "reg-cancel-guest@example.com" });
    const guestToken = (await login(guest.email)).token;
    const room = await createRoom(adminToken, { roomNumber: "REG-CANCEL-1" });

    const booking = await request(app)
      .post("/api/bookings")
      .set(auth(guestToken))
      .send({
        room: room._id.toString(),
        checkInDate: dateAfter(1),
        checkOutDate: dateAfter(2),
        guestsCount: 1,
      });

    await request(app).patch(`/api/bookings/${booking.body.booking._id}/check-in`).set(auth(adminToken));

    const cancelled = await request(app)
      .patch(`/api/bookings/${booking.body.booking._id}/cancel`)
      .set(auth(adminToken))
      .send({ reason: "Front desk mistake" });
    expect(cancelled.status).toBe(400);

    const refreshed = await Room.findById(room._id);
    expect(refreshed.status).toBe("occupied");
  });

  it("rejects lifecycle status changes through the generic booking update", async () => {
    const admin = await createUser({ role: "admin", email: "reg-status-admin@example.com" });
    const adminToken = (await login(admin.email)).token;
    const guest = await createUser({ email: "reg-status-guest@example.com" });
    const guestToken = (await login(guest.email)).token;
    const room = await createRoom(adminToken, { roomNumber: "REG-STATUS-1" });

    const booking = await request(app)
      .post("/api/bookings")
      .set(auth(guestToken))
      .send({
        room: room._id.toString(),
        checkInDate: dateAfter(1),
        checkOutDate: dateAfter(2),
        guestsCount: 1,
      });

    const response = await request(app)
      .put(`/api/bookings/${booking.body.booking._id}`)
      .set(auth(adminToken))
      .send({ status: "checked_out" });
    expect(response.status).toBe(400);
  });

  it("rejects malformed date filters on the audit trail", async () => {
    const admin = await createUser({ role: "admin", email: "reg-audit-admin@example.com" });
    const token = (await login(admin.email)).token;

    const response = await request(app).get("/api/audit-logs?from=not-a-date").set(auth(token));
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/invalid date/i);
  });

  it("derives permissions from the role when the stored list is stale", async () => {
    // Simulates hand-seeded/demo data or a role flipped directly in Mongo:
    // the document says "admin" but still carries the guest permission list.
    const user = await createUser({ role: "guest", email: "reg-stale-admin@example.com" });
    await User.collection.updateOne(
      { _id: user._id },
      { $set: { role: "admin", permissions: permissionsForRole("guest") } }
    );

    const session = await login(user.email);
    expect(session.user.permissions).toContain("view_reports");

    expect((await request(app).get("/api/reports/dashboard").set(auth(session.token))).status).toBe(200);
    expect((await request(app).get("/api/users").set(auth(session.token))).status).toBe(200);
  });

  it("drops a manual permission override when the role changes", async () => {
    const admin = await createUser({ role: "admin", email: "reg-reset-admin@example.com" });
    const adminToken = (await login(admin.email)).token;
    const staff = await createUser({ role: "receptionist", email: "reg-reset-staff@example.com" });

    await request(app)
      .put(`/api/users/${staff._id}/permissions`)
      .set(auth(adminToken))
      .send({ permissions: ["view_rooms"] });

    const restrictedToken = (await login(staff.email)).token;
    expect((await request(app).get("/api/reports/dashboard").set(auth(restrictedToken))).status).toBe(403);

    const promoted = await request(app)
      .put(`/api/users/${staff._id}`)
      .set(auth(adminToken))
      .send({ role: "manager" });
    expect(promoted.status).toBe(200);
    expect(promoted.body.user.permissionsCustomized).toBe(false);
    expect(promoted.body.user.permissions).toContain("view_reports");

    const promotedToken = (await login(staff.email)).token;
    expect((await request(app).get("/api/reports/dashboard").set(auth(promotedToken))).status).toBe(200);
  });
});
