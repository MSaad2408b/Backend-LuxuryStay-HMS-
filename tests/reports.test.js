const { app, request, createUser, login, auth, dateAfter, createRoom } = require("./helpers");

describe("Reporting and analytics", () => {
  let adminToken;

  beforeEach(async () => {
    const admin = await createUser({ role: "admin", email: "reports-admin@example.com" });
    adminToken = (await login(admin.email)).token;
    const guest = await createUser({ email: "reports-guest@example.com" });
    const guestToken = (await login(guest.email)).token;
    const room = await createRoom(adminToken, { roomNumber: "REPORT-1", pricePerNight: 1500 });

    const booking = await request(app)
      .post("/api/bookings")
      .set(auth(guestToken))
      .send({
        room: room._id.toString(),
        checkInDate: dateAfter(1),
        checkOutDate: dateAfter(2),
        guestsCount: 1,
      });
    expect(booking.status).toBe(201);

    const invoice = await request(app)
      .post("/api/invoices")
      .set(auth(adminToken))
      .send({ booking: booking.body.booking._id });
    await request(app)
      .patch(`/api/invoices/${invoice.body.invoice._id}/payment`)
      .set(auth(adminToken))
      .send({ paymentMethod: "cash", paymentStatus: "paid" });
  });

  it("returns a dashboard summary with occupancy and revenue", async () => {
    const response = await request(app).get("/api/reports/dashboard").set(auth(adminToken));
    expect(response.status).toBe(200);
    expect(response.body.summary.totalRooms).toBe(1);
    expect(response.body.summary.totalRevenue).toBe(1500);
    expect(response.body.summary.averageRating).toBe(0);
  });

  it("provides demand forecasting and pricing optimization insights", async () => {
    const forecast = await request(app).get("/api/reports/analytics/forecast").set(auth(adminToken));
    expect(forecast.status).toBe(200);
    expect(forecast.body.method).toMatch(/moving average/i);
    expect(forecast.body.forecast).toHaveProperty("expectedBookings");

    const pricing = await request(app).get("/api/reports/analytics/pricing").set(auth(adminToken));
    expect(pricing.status).toBe(200);
    expect(pricing.body.insights.length).toBeGreaterThan(0);
    expect(pricing.body.insights[0]).toHaveProperty("suggestedPrice");
  });

  it("exports customizable reports as CSV", async () => {
    const response = await request(app)
      .get("/api/reports/custom?metric=bookings&format=csv")
      .set(auth(adminToken));
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/csv/);
    expect(response.text).toContain("Group");
    expect(response.text).toMatch(/20\d\d-\d\d/);
  });

  it("groups occupancy and revenue reports", async () => {
    const occupancy = await request(app).get("/api/reports/occupancy/by-type").set(auth(adminToken));
    expect(occupancy.status).toBe(200);
    expect(occupancy.body.report[0].type).toBe("deluxe");

    const revenue = await request(app).get("/api/reports/revenue/by-service").set(auth(adminToken));
    expect(revenue.status).toBe(200);
    expect(revenue.body.revenueByService[0].type).toBe("room");
  });
});
