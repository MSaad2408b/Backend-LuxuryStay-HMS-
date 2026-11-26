const express = require("express");
const router = express.Router();

const { getSettings, upsertSetting, deleteSetting } = require("../controllers/settingController");
const { protect, authorizeRoles } = require("../middleware/authmiddleware");
const validate = require("../middleware/validate");
const { validateObjectIdParam } = require("../middleware/validateObjectId");
const { upsertSettingSchema } = require("../validation/settingSchema");

router.param("id", validateObjectIdParam);

router.use(protect, authorizeRoles("admin"));

router.get("/", getSettings);
router.put("/", validate(upsertSettingSchema), upsertSetting);
router.delete("/:id", deleteSetting);

module.exports = router;
