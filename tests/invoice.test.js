const Booking = require("../models/Booking");
const { app, request, createUser, login, auth, dateAfter, createRoom } = require("./helpers");

describe("Billing, invoicing and additional services", () => {
  let adminToken;
  let guestToken;
  let room;
  let bookingId;

  beforeEach(async () => {
    const admin = await createUser({ role: "admin", email: "admin-invoice@example.com" });
    adminToken = (await login(admin.email)).token;
    const guest = await createUser({ role: "guest", email: "guest-invoice@example.com" });
    guestToken = (await login(guest.email)).token;
    room = await createRoom(adminToken, { roomNumber: "INVOICE-1", pricePerNight: 2000 });

    const booking = await request(app)
      .post("/api/bookings")
      .set(auth(guestToken))
      .send({
        room: room._id.toString(),
        checkInDate: dateAfter(1),
        checkOutDate: dateAfter(3),
        guestsCount: 2,
      });
    expect(booking.status).toBe(201);
    bookingId = booking.body.booking._id;
  });

  it("applies the configured tax rate from system settings", async () => {
    const setting = await request(app)
      .put("/api/settings")
      .set(auth(adminToken))
      .send({ key: "tax_rate_percent", value: 10 });
    expect(setting.status).toBe(200);

    const response = await request(app)
      .post("/api/invoices")
      .set(auth(adminToken))
      .send({ booking: bookingId });
    expect(response.status).toBe(201);

    const invoice = response.body.invoice;
    expect(invoice.charges[0].type).toBe("room");
    expect(invoice.tax).toBe(400); // 2 nights * 2000 * 10%
    expect(invoice.totalAmount).toBe(4400);
  });

  it("adds charges and keeps booking payment status in sync", async () => {
    const created = await request(app)
      .post("/api/invoices")
      .set(auth(adminToken))
      .send({ booking: bookingId });
    const invoiceId = created.body.invoice._id;

    const charged = await request(app)
      .post(`/api/invoices/${invoiceId}/charges`)
      .set(auth(adminToken))
      .send({ description: "Laundry", amount: 300, type: "laundry" });
    expect(charged.status).toBe(200);
    expect(charged.body.invoice.totalAmount).toBe(4300);

    const paid = await request(app)
      .patch(`/api/invoices/${invoiceId}/payment`)
      .set(auth(adminToken))
      .send({ paymentMethod: "card", paymentStatus: "paid" });
    expect(paid.status).toBe(200);

    const booking = await Booking.findById(bookingId);
    expect(booking.paymentStatus).toBe("paid");
  });

  it("bills a completed paid service request into the invoice", async () => {
    const created = await request(app)
      .post("/api/invoices")
      .set(auth(adminToken))
      .send({ booking: bookingId });
    const invoiceId = created.body.invoice._id;

    const service = await request(app)
      .post("/api/service-requests")
      .set(auth(guestToken))
      .send({ booking: bookingId, serviceType: "room_service", details: "Dinner for two" });
    expect(service.status).toBe(201);

    const completed = await request(app)
      .put(`/api/service-requests/${service.body.request._id}`)
      .set(auth(adminToken))
      .send({ status: "completed", cost: 750 });
    expect(completed.status).toBe(200);

    const invoice = await request(app).get(`/api/invoices/${invoiceId}`).set(auth(adminToken));
    expect(invoice.body.invoice.totalAmount).toBe(4750);
    expect(invoice.body.invoice.charges.some((charge) => charge.type === "service")).toBe(true);
  });

  it("serves a printable invoice and reports email delivery state", async () => {
    const created = await request(app)
      .post("/api/invoices")
      .set(auth(adminToken))
      .send({ booking: bookingId });
    const invoiceId = created.body.invoice._id;

    const printed = await request(app).get(`/api/invoices/${invoiceId}/print`).set(auth(guestToken));
    expect(printed.status).toBe(200);
    expect(printed.headers["content-type"]).toMatch(/text\/html/);
    expect(printed.text).toContain(created.body.invoice.invoiceNumber);

    const emailed = await request(app)
      .post(`/api/invoices/${invoiceId}/send-email`)
      .set(auth(adminToken))
      .send({});
    expect(emailed.status).toBe(200);
    expect(emailed.body.delivery.reason || emailed.body.delivery.delivered).toBeTruthy();
  });
});
