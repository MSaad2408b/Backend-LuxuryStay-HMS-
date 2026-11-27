const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");

const config = require("./config/env");
const connectDB = require("./config/db");
const { corsOptions, requestId, enforceHttps } = require("./middleware/security");
const { requestLogger } = require("./utils/logger");
const rateLimiter = require("./middleware/rateLimiter");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { getHealth } = require("./controllers/adminController");
const openApi = require("./docs/openapi.json");

const authRoutes = require("./routes/authroute");
const userRoutes = require("./routes/userRoutes");
const roomRoutes = require("./routes/roomRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const housekeepingRoutes = require("./routes/housekeepingRoutes");
const maintenanceRoutes = require("./routes/maintenanceRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const serviceRequestRoutes = require("./routes/serviceRequestRoutes");
const reportRoutes = require("./routes/reportRoutes");
const settingRoutes = require("./routes/settingRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const auditRoutes = require("./routes/auditRoutes");
const privacyRoutes = require("./routes/privacyRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(requestId);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors());
app.use(enforceHttps);
app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);

// Liveness/readiness probes sit in front of the limiter so an uptime monitor
// polling every few seconds cannot exhaust the shared request budget.
app.get("/", (req, res) => {
  res.status(200).json({ message: "LuxuryStay HMS API is running", version: "1.0.0" });
});

app.get("/api/health", getHealth);

app.use(
  rateLimiter({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    prefix: "global",
  })
);

app.get("/api-docs.json", (req, res) => res.json(openApi));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApi));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/housekeeping", housekeepingRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/service-requests", serviceRequestRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/privacy", privacyRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = { app, connectDB };
