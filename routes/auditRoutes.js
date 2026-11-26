const express = require("express");
const router = express.Router();

const { getAuditLogs } = require("../controllers/auditController");
const { protect, authorizeRoles } = require("../middleware/authmiddleware");

router.use(protect, authorizeRoles("admin", "manager"));
router.get("/", getAuditLogs);

module.exports = router;
