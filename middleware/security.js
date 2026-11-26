const config = require("../config/env");

const requestId = (req, res, next) => {
  req.requestId = req.headers["x-request-id"] || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  res.setHeader("X-Request-Id", req.requestId);
  next();
};

const enforceHttps = (req, res, next) => {
  if (!config.enforceHttps) return next();
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  if (proto === "https") return next();
  if (config.isTest) return next();
  return res.status(403).json({ message: "HTTPS is required" });
};

const corsOptions = {
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  credentials: true,
  maxAge: 600,
};

module.exports = { requestId, enforceHttps, corsOptions };
