const mongoose = require("mongoose");
const { encryptedString } = require("../utils/encryption");
const { permissionsForRole } = require("../config/permissions");
const config = require("../config/env");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    // PII encrypted at rest with AES-256-GCM; getters return plaintext to the app.
    contact: encryptedString({ required: true }),
    address: encryptedString({ required: true }),

    role: {
      type: String,
      default: "guest",
      enum: ["admin", "manager", "receptionist", "housekeeping", "guest"],
    },

    permissions: {
      type: [String],
      default: () => permissionsForRole("guest"),
    },

    // Set only by `PUT /api/users/:id/permissions`. While false, permissions
    // are derived from the role on every check (see config/permissions.js).
    permissionsCustomized: {
      type: Boolean,
      default: false,
    },

    preferences: {
      type: String,
      trim: true,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    anonymized: {
      type: Boolean,
      default: false,
    },

    privacyConsent: {
      privacyPolicy: { type: Boolean, default: false },
      marketing: { type: Boolean, default: false },
      version: { type: String, default: config.consentVersion },
      acceptedAt: { type: Date, default: null },
      withdrawnAt: { type: Date, default: null },
    },

    notificationPreferences: {
      email: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true },
      types: {
        type: [String],
        default: ["booking", "maintenance", "housekeeping", "service", "system", "general"],
      },
    },

    passwordResetToken: {
      type: String,
      default: null,
      select: false,
    },

    passwordResetExpires: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

userSchema.pre("validate", function (next) {
  if (this.isModified("role")) {
    // A new role starts from that role's defaults; any previous manual
    // override belongs to the old role and must not leak into the new one.
    this.permissions = permissionsForRole(this.role);
    this.permissionsCustomized = false;
  } else if (!this.permissions || this.permissions.length === 0) {
    this.permissions = permissionsForRole(this.role);
  }
  next();
});

userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model("User", userSchema);
