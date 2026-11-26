const express = require("express");
const router = express.Router();

const {
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  refreshAccessToken,
  logoutUser,
} = require("../controllers/authcontroller");
const {
  validateRegister,
  validateLogin,
} = require("../middleware/authValidation");
const validate = require("../middleware/validate");
const { protect } = require("../middleware/authmiddleware");
const rateLimiter = require("../middleware/rateLimiter");
const config = require("../config/env");
const {
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../validation/userSchema");
const { refreshSchema } = require("../validation/authSchema");

const authLimiter = rateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  prefix: "auth",
});

router.post("/register", authLimiter, validateRegister, registerUser);
router.post("/login", authLimiter, validateLogin, loginUser);
router.post("/forgot-password", authLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", authLimiter, validate(resetPasswordSchema), resetPassword);
router.post("/refresh", authLimiter, validate(refreshSchema), refreshAccessToken);

router.use(protect);
router.get("/me", getMe);
router.put("/profile", validate(updateProfileSchema), updateProfile);
router.put("/change-password", validate(changePasswordSchema), changePassword);
router.post("/logout", logoutUser);

module.exports = router;
