const AuditLog = require("../models/AuditLog");
const { parseDateRange } = require("../utils/dateRange");

const getAuditLogs = async (req, res) => {
  try {
    const { action, resource, user, from, to, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (action) filter.action = action;
    if (resource) filter.resource = resource;
    if (user) filter.user = user;

    const { range, invalid } = parseDateRange({ from, to });
    if (invalid.length) {
      return res.status(400).json({ message: `Invalid date filter: ${invalid.join(", ")}` });
    }
    if (range) filter.createdAt = range;

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 50, 1), 200);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate("user", "name email role")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      AuditLog.countDocuments(filter),
    ]);

    res.status(200).json({
      logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch audit logs", error: error.message });
  }
};

module.exports = { getAuditLogs };
