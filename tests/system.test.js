const { app, request, createUser, login, auth } = require("./helpers");

describe("System endpoints and API documentation", () => {
  it("exposes a public root and health endpoint", async () => {
    const root = await request(app).get("/");
    expect(root.status).toBe(200);
    expect(root.body.message).toMatch(/LuxuryStay HMS API/);

    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body.status).toBe("ok");
    expect(health.body.database).toBe("connected");
    expect(health.body).toHaveProperty("requests");
  });

  it("serves the OpenAPI specification and Swagger UI", async () => {
    const spec = await request(app).get("/api-docs.json");
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe("3.0.3");
    expect(spec.body.paths).toHaveProperty("/api/auth/login");
    expect(spec.body.paths).toHaveProperty("/api/bookings/{id}/check-out");
    expect(spec.body.paths).toHaveProperty("/api/privacy/export");

    const ui = await request(app).get("/api-docs/").redirects(1);
    expect(ui.status).toBe(200);
    expect(ui.headers["content-type"]).toMatch(/text\/html/);
    expect(ui.text).toContain("swagger-ui");
  });

  it("exposes runtime metrics to administrators", async () => {
    const admin = await createUser({ role: "admin", email: "system-admin@example.com" });
    const token = (await login(admin.email)).token;

    const metrics = await request(app).get("/api/admin/metrics").set(auth(token));
    expect(metrics.status).toBe(200);
    expect(typeof metrics.body.requests).toBe("number");
    expect(typeof metrics.body.averageResponseMs).toBe("number");
    expect(metrics.body).toHaveProperty("uptimeSeconds");
  });

  it("denies metrics access to guests", async () => {
    const guest = await createUser({ email: "system-guest@example.com" });
    const token = (await login(guest.email)).token;

    const metrics = await request(app).get("/api/admin/metrics").set(auth(token));
    expect(metrics.status).toBe(403);
  });
});
