const express = require("express");
const router = express.Router();

const {
  createStaffUser,
  getUsers,
  getUserById,
  updateUser,
  deactivateUser,
  activateUser,
  getGuests,
  updatePermissions,
} = require("../controllers/userController");
const { protect, authorizeRoles, requirePermission } = require("../middleware/authmiddleware");
const validate = require("../middleware/validate");
const { validateObjectIdParam } = require("../middleware/validateObjectId");
const {
  createStaffSchema,
  updateUserSchema,
  permissionsSchema,
} = require("../validation/userSchema");

router.param("id", validateObjectIdParam);

// The front desk needs the guest directory to take a reservation, so this read
// is open to admin, manager and receptionist. Everything else stays admin-only.
router.get("/guests", protect, authorizeRoles("admin", "manager", "receptionist"), getGuests);

router.use(protect, authorizeRoles("admin"));

router.post("/", requirePermission("manage_users"), validate(createStaffSchema), createStaffUser);
router.get("/", requirePermission("manage_users"), getUsers);
router.get("/:id", getUserById);
router.put("/:id", requirePermission("manage_users"), validate(updateUserSchema), updateUser);
router.put("/:id/permissions", requirePermission("manage_roles"), validate(permissionsSchema), updatePermissions);
router.patch("/:id/deactivate", requirePermission("manage_users"), deactivateUser);
router.patch("/:id/activate", requirePermission("manage_users"), activateUser);

module.exports = router;
