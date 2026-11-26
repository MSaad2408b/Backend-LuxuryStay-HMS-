const express = require("express");
const router = express.Router();

const {
  createTask,
  getTasks,
  updateTask,
} = require("../controllers/housekeepingController");
const { protect, authorizeRoles } = require("../middleware/authmiddleware");
const validate = require("../middleware/validate");
const { validateObjectIdParam } = require("../middleware/validateObjectId");
const {
  createHousekeepingTaskSchema,
  updateHousekeepingTaskSchema,
} = require("../validation/housekeepingSchema");

router.param("id", validateObjectIdParam);

router.use(protect);

router.post("/", authorizeRoles("admin", "manager", "receptionist"), validate(createHousekeepingTaskSchema), createTask);
router.get("/", authorizeRoles("admin", "manager", "receptionist", "housekeeping"), getTasks);
router.put("/:id", authorizeRoles("admin", "manager", "receptionist", "housekeeping"), validate(updateHousekeepingTaskSchema), updateTask);

module.exports = router;
