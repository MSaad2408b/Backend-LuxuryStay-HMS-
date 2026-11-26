const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/UserSchema");
const RefreshToken = require("../models/RefreshToken");
const TokenBlacklist = require("../models/TokenBlacklist");
const config = require("../config/env");
const { logAudit } = require("../utils/auditLogger");
const { hash } = require("../utils/encryption");
const { sendEmail, templates } = require("../utils/email");
const { getSetting } = require("../utils/settings");
const { effectivePermissions } = require("../config/permissions");

const createToken = (user) =>
  jwt.sign(
    {
      userId: user._id,
      role: user.role,
      permissions: effectivePermissions(user),
      jti: crypto.randomUUID(),
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, algorithm: "HS256" }
  );

const issueRefreshToken = async (user, req) => {
  const token = crypto.randomBytes(48).toString("hex");
  await RefreshToken.create({
    user: user._id,
    tokenHash: hash(token),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    userAgent: req.headers["user-agent"] || "",
    ipAddress: req.ip || "",
  });
  return token;
};

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  address: user.address,
  contact: user.contact,
  role: user.role,
  permissions: effectivePermissions(user),
  permissionsCustomized: Boolean(user.permissionsCustomized),
  preferences: user.preferences || "",
  isActive: user.isActive,
  privacyConsent: user.privacyConsent,
  notificationPreferences: user.notificationPreferences,
  createdAt: user.createdAt,
});

const registerUser = async (req, res) => {
  try {
    const { name, email, address, contact, password, acceptPrivacyPolicy, acceptMarketing, privacyPolicyVersion } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const version = privacyPolicyVersion || (await getSetting("privacy_policy_version", config.consentVersion));

    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      address,
      contact,
      password: hashedPassword,
      role: "guest",
      privacyConsent: {
        privacyPolicy: acceptPrivacyPolicy !== false,
        marketing: Boolean(acceptMarketing),
        version,
        acceptedAt: acceptPrivacyPolicy !== false ? new Date() : null,
      },
    });

    req.user = user;
    await logAudit(req, {
      action: "REGISTER",
      resource: "User",
      resourceId: user._id,
      details: { email: user.email, consentVersion: version },
    });

    if (user.privacyConsent.privacyPolicy) {
      await sendEmail({ to: user.email, subject: "Welcome to LuxuryStay", html: templates.welcome(user.name) });
    }

    res.status(201).json({
      message: "User registered successfully",
      user: sanitizeUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Email already registered" });
    }
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password");
    if (!user) return res.status(401).json({ message: "Invalid email or password" });
    if (!user.isActive) return res.status(403).json({ message: "Your account is inactive" });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(401).json({ message: "Invalid email or password" });

    const token = createToken(user);
    const refreshToken = await issueRefreshToken(user, req);

    req.user = user;
    await logAudit(req, { action: "LOGIN", resource: "User", resourceId: user._id, details: { email: user.email } });

    res.status(200).json({
      message: "Login successful",
      token,
      refreshToken,
      expiresIn: config.jwtExpiresIn,
      user: sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
};

const getMe = async (req, res) => {
  res.status(200).json({ user: sanitizeUser(req.user) });
};

const updateProfile = async (req, res) => {
  try {
    const allowedFields = ["name", "contact", "address", "preferences"];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    await logAudit(req, { action: "UPDATE_PROFILE", resource: "User", resourceId: user._id });
    res.status(200).json({ message: "Profile updated successfully", user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ message: "Failed to update profile", error: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select("+password");

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: "Current password is incorrect" });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

    await logAudit(req, { action: "CHANGE_PASSWORD", resource: "User", resourceId: user._id });
    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to change password", error: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const email = req.body.email.toLowerCase().trim();
    const user = await User.findOne({ email }).select("+passwordResetToken +passwordResetExpires");

    if (!user) {
      return res.status(200).json({ message: "If the email exists, a reset token has been generated." });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetToken = hash(resetToken);
    user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    await logAudit(req, { action: "FORGOT_PASSWORD", resource: "User", resourceId: user._id });
    const emailResult = await sendEmail({
      to: user.email,
      subject: "Password Reset Request",
      html: templates.passwordReset(resetToken, 30),
    });

    const response = {
      message: "If the email exists, a reset token has been generated.",
      expiresInMinutes: 30,
      emailDelivered: emailResult.delivered,
    };
    // Local/demo fallback only; production never exposes the token in the response.
    if (!config.isProduction) response.resetToken = resetToken;
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: "Failed to process forgot password request", error: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const hashedToken = hash(token);

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    }).select("+password +passwordResetToken +passwordResetExpires");

    if (!user) return res.status(400).json({ message: "Invalid or expired reset token" });

    user.password = await bcrypt.hash(newPassword, 12);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();
    await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

    await logAudit(req, { action: "RESET_PASSWORD", resource: "User", resourceId: user._id });
    await sendEmail({
      to: user.email,
      subject: "Password Changed",
      html: templates.generic("Password Changed", "<p>Your LuxuryStay password was reset successfully.</p>"),
    });

    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ message: "Failed to reset password", error: error.message });
  }
};

const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const record = await RefreshToken.findOne({
      tokenHash: hash(refreshToken),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!record) return res.status(401).json({ message: "Invalid or expired refresh token" });

    const user = await User.findById(record.user);
    if (!user || !user.isActive) return res.status(401).json({ message: "User not found or inactive" });

    record.revokedAt = new Date();
    const newRefreshToken = crypto.randomBytes(48).toString("hex");
    record.replacedByHash = hash(newRefreshToken);
    await record.save();

    await RefreshToken.create({
      user: user._id,
      tokenHash: hash(newRefreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      userAgent: req.headers["user-agent"] || "",
      ipAddress: req.ip || "",
    });

    await logAudit(req, { action: "REFRESH_TOKEN", resource: "User", resourceId: user._id });
    res.status(200).json({
      token: createToken(user),
      refreshToken: newRefreshToken,
      expiresIn: config.jwtExpiresIn,
      user: sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to refresh token", error: error.message });
  }
};

const logoutUser = async (req, res) => {
  try {
    const token = req.accessToken || req.headers.authorization?.split(" ")[1];
    if (token) {
      const decoded = jwt.decode(token);
      try {
        await TokenBlacklist.create({
          tokenHash: hash(token),
          user: req.user?._id || decoded?.userId || null,
          expiresAt: decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          reason: "logout",
        });
      } catch (error) {
        // Two concurrent logout calls for the same token race on the unique
        // index; the token is already revoked, so this is not a failure.
        if (error.code !== 11000) throw error;
      }
    }

    const submittedRefresh = req.body?.refreshToken;
    const filter = { user: req.user._id, revokedAt: null };
    if (submittedRefresh) filter.tokenHash = hash(submittedRefresh);
    await RefreshToken.updateMany(filter, { $set: { revokedAt: new Date() } });

    await logAudit(req, { action: "LOGOUT", resource: "User", resourceId: req.user._id });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to logout", error: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  refreshAccessToken,
  logoutUser,
  createToken,
  issueRefreshToken,
  sanitizeUser,
};
