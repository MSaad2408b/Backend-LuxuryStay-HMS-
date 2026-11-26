const AuditLog = require("../models/AuditLog");

const logAudit = async (req, { action, resource, resourceId = "", details = {} }) => {
  try {
    await AuditLog.create({
      user: req.user?._id || null,
      action,
      resource,
      resourceId: String(resourceId || ""),
      details,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
    });
  } catch (error) {
    console.error("Audit log failed:", error.message);
  }
};

module.exports = { logAudit };
