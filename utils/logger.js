const config = require("../config/env");

const metrics = {
  startTime: Date.now(),
  requests: 0,
  errors: 0,
  totalResponseMs: 0,
  byStatus: {},
};

const emit = (level, message, meta = {}) => {
  if (config.isTest) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

const logger = {
  info: (message, meta) => emit("info", message, meta),
  warn: (message, meta) => emit("warn", message, meta),
  error: (message, meta) => emit("error", message, meta),
  debug: (message, meta) => {
    if (process.env.LOG_LEVEL === "debug") emit("debug", message, meta);
  },
};

const requestLogger = (req, res, next) => {
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    metrics.requests += 1;
    metrics.totalResponseMs += durationMs;
    metrics.byStatus[res.statusCode] = (metrics.byStatus[res.statusCode] || 0) + 1;
    if (res.statusCode >= 400) metrics.errors += 1;
    logger.info("http_request", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      requestId: req.requestId || null,
    });
  });
  next();
};

const getMetricsSnapshot = () => ({
  uptimeSeconds: Math.floor((Date.now() - metrics.startTime) / 1000),
  requests: metrics.requests,
  errors: metrics.errors,
  averageResponseMs: metrics.requests ? Number((metrics.totalResponseMs / metrics.requests).toFixed(2)) : 0,
  byStatus: { ...metrics.byStatus },
});

module.exports = { logger, requestLogger, getMetricsSnapshot, metrics };
