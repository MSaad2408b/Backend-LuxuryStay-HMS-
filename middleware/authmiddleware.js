const jwt = require("jsonwebtoken");
const User = require("../models/UserSchema");
const TokenBlacklist = require("../models/TokenBlacklist");
const config = require("../config/env");
const { effectivePermissions } = require("../config/permissions");
const { hash } = require("../utils/encryption");

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });

    const blacklisted = await TokenBlacklist.exists({ tokenHash: hash(token) });
    if (blacklisted) {
      return res.status(401).json({ message: "Token has been revoked" });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Your account is inactive" });
    }

    req.user = user;
    req.permissions = effectivePermissions(user);
    req.accessToken = token;
    req.tokenClaims = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission to perform this action",
      });
    }
    next();
  };
};

const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const granted = new Set(req.permissions || effectivePermissions(req.user));
    if (permissions.length && !permissions.every((permission) => granted.has(permission))) {
      return res.status(403).json({ message: "Missing required permission" });
    }
    next();
  };
};

const requireConsent = (req, res, next) => {
  const consent = req.user?.privacyConsent;
  if (consent && consent.privacyPolicy === false) {
    return res.status(403).json({
      message: "Privacy policy consent is required before using this feature",
    });
  }
  next();
};

module.exports = { protect, authorizeRoles, requirePermission, requireConsent };
