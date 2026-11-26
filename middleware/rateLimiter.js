const RateLimit = require("../models/RateLimit");
const { logger } = require("../utils/logger");

const memory = new Map();

const memoryLimit = (key, windowMs, max) => {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now > entry.resetAt) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  entry.count += 1;
  memory.set(key, entry);
  return entry.count > max
    ? { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
    : { allowed: true, retryAfter: 0 };
};

/**
 * MongoDB-backed sliding window counter so limits apply across scaled instances.
 * Falls back to an in-process map if the database is unavailable.
 */
const rateLimiter = ({ windowMs = 15 * 60 * 1000, max = 200, prefix = "global" } = {}) => {
  return async (req, res, next) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const key = `${prefix}:${ip}`;
    const now = new Date();

    try {
      const active = await RateLimit.findOneAndUpdate(
        { key, resetAt: { $gt: now } },
        { $inc: { count: 1 } },
        { new: true }
      ).lean();

      const record = active ||
        (await RateLimit.findOneAndUpdate(
          { key },
          { $set: { count: 1, resetAt: new Date(Date.now() + windowMs) } },
          { upsert: true, new: true }
        ).lean());

      if (record.count > max) {
        const retryAfter = Math.max(Math.ceil((new Date(record.resetAt).getTime() - Date.now()) / 1000), 1);
        res.setHeader("Retry-After", String(retryAfter));
        return res.status(429).json({ message: "Too many requests, please try again later." });
      }
      return next();
    } catch (error) {
      logger.warn("rate_limit_fallback", { error: error.message, key });
      const result = memoryLimit(key, windowMs, max);
      if (!result.allowed) {
        res.setHeader("Retry-After", String(result.retryAfter || 1));
        return res.status(429).json({ message: "Too many requests, please try again later." });
      }
      return next();
    }
  };
};

module.exports = rateLimiter;
