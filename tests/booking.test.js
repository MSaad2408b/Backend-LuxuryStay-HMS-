const User = require("../models/UserSchema");
const HousekeepingTask = require("../models/HousekeepingTask");
const Room = require("../models/Room");
const { app, request, createUser, login, auth, dateAfter, createRoom } = require("./helpers");

describe("Reservation and check-in/out lifecycle", () => {
  let adminToken;
  let guestToken;
  let guestEmail;

  beforeEach(async () => {
    const admin = await createUser({ role: "admin", email: "admin-booking@example.com" });
    adminToken = (await login(admin.email)).token;
    const guest = await createUser({ role: "guest", email: "guest-booking@example.com" });
    guestEmail = guest.email;
    guestToken = (await login(guest.email)).token;
  });

  const bookingPayload = (room, overrides = {}) => ({
    room,
    checkInDate: dateAfter(3),
    checkOutDate: dateAfter(5),
    guestsCount: 2,
    ...overrides,
  });

  it("creates a reservation with confirmation code and blocks overlapping bookings", async () => {
    const room = await createRoom(adminToken);

    const first = await request(app)
      .post("/api/bookings")
      .set(auth(guestToken))
      .send(bookingPayload(room._id.toString()));
    expect(first.status).toBe(201);
    expect(first.body.booking.confirmationCode).toMatch(/^LS-/);

    const second = await request(app)
      .post("/api/bookings")
      .set(auth(guestToken))
      .send(bookingPayload(room._id.toString()));
    expect(second.status).toBe(409);

    const available = await request(app)
      .get(`/api/rooms/availability/search?checkInDate=${dateAfter(3)}&checkOutDate=${dateAfter(5)}`)
      .set(auth(guestToken));
    expect(available.status).toBe(200);
    expect(available.body.count).toBe(0);
  });

  it("allows only one of two concurrent reservations for the same room", async () => {
    const room = await createRoom(adminToken, { roomNumber: "CONCURRENT-1" });

    const results = await Promise.all([
      request(app).post("/api/bookings").set(auth(guestToken)).send(bookingPayload(room._id.toString())),
      request(app).post("/api/bookings").set(auth(guestToken)).send(bookingPayload(room._id.toString())),
    ]);

    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([201, 409]);
  });

  it("checks in with a key card, then checks out with auto-invoice and cleaning task", async () => {
    const room = await createRoom(adminToken, { roomNumber: "LIFECYCLE-1" });
    const created = await request(app)
      .post("/api/bookings")
      .set(auth(guestToken))
      .send(bookingPayload(room._id.toString()));
    expect(created.status).toBe(201);
    const bookingId = created.body.booking._id;

    const checkIn = await request(app)
      .patch(`/api/bookings/${bookingId}/check-in`)
      .set(auth(adminToken));
    expect(checkIn.status).toBe(200);
    expect(checkIn.body.booking.keyCard.number).toMatch(/^KEY-/);

    const occupied = await request(app).get(`/api/rooms/${room._id}`).set(auth(adminToken));
    expect(occupied.body.room.status).toBe("occupied");

    const checkOut = await request(app)
      .patch(`/api/bookings/${bookingId}/check-out`)
      .set(auth(adminToken));
    expect(checkOut.status).toBe(200);
    expect(checkOut.body.invoiceId).toBeTruthy();
    expect(checkOut.body.warning).toBeUndefined();

    const cleaned = await request(app).get(`/api/rooms/${room._id}`).set(auth(adminToken));
    expect(cleaned.body.room.status).toBe("cleaning");
    expect(await HousekeepingTask.countDocuments({ room: room._id })).toBe(1);
    expect(await Room.findById(room._id).then((r) => r.status)).toBe("cleaning");
  });

  it("lets a guest cancel their own booking and frees the room", async () => {
    const room = await createRoom(adminToken, { roomNumber: "CANCEL-1" });
    const created = await request(app)
      .post("/api/bookings")
      .set(auth(guestToken))
      .send(bookingPayload(room._id.toString()));
    const bookingId = created.body.booking._id;

    const cancelled = await request(app)
      .patch(`/api/bookings/${bookingId}/cancel`)
      .set(auth(guestToken))
      .send({ reason: "Plans changed" });
    expect(cancelled.status).toBe(200);

    const updatedRoom = await Room.findById(room._id);
    expect(updatedRoom.status).toBe("available");
  });

  it("allows staff to book on behalf of a guest", async () => {
    const guest = await User.findById(
      (await request(app).get("/api/auth/me").set(auth(guestToken))).body.user.id
    );
    const room = await createRoom(adminToken, { roomNumber: "STAFF-BOOK-1" });

    const response = await request(app)
      .post("/api/bookings")
      .set(auth(adminToken))
      .send({ ...bookingPayload(room._id.toString()), guest: guest._id.toString() });

    expect(response.status).toBe(201);
    expect(String(response.body.booking.guest._id)).toBe(String(guest._id));
    expect(guestEmail).toContain("@");
  });
});
