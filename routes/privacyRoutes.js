const express = require("express");
const router = express.Router();

const {
  getConsent,
  updateConsent,
  exportMyData,
  deleteMyData,
} = require("../controllers/privacyController");
const { protect } = require("../middleware/authmiddleware");
const validate = require("../middleware/validate");
const { consentSchema, deleteAccountSchema } = require("../validation/privacySchema");

router.use(protect);

router.get("/consent", getConsent);
router.put("/consent", validate(consentSchema), updateConsent);
router.get("/export", exportMyData);
router.delete("/me", validate(deleteAccountSchema), deleteMyData);

module.exports = router;
