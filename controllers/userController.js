const bcrypt = require("bcrypt");
const User = require("../models/UserSchema");
const { permissionsForRole, effectivePermissions } = require("../config/permissions");
const { logAudit } = require("../utils/auditLogger");

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
  privacyConsent: user.privacyConsent,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const createStaffUser = async (req, res) => {
  try {
    const { name, email, address, contact, password, role } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      address,
      contact,
      password: hashedPassword,
      role,
    });

    await logAudit(req, { action: "CREATE_USER", resource: "User", resourceId: user._id, details: { role: user.role, email: user.email } });

    res.status(201).json({
      message: "User created successfully",
      user: sanitizeUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Email already registered" });
    }
    res.status(500).json({ message: "Failed to create user", error: error.message });
  }
};

const getUsers = async (req, res) => {
  try {
    const { role, isActive, search } = req.query;
    const filter = {};

    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    if (search) {
      const regex = new RegExp(search, "i");
      // contact/address are encrypted at rest, so search only plaintext fields.
      filter.$or = [{ name: regex }, { email: regex }];
    }

    const users = await User.find(filter).select("-password -passwordResetToken -passwordResetExpires").sort({ createdAt: -1 });
    res.status(200).json({ users });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users", error: error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -passwordResetToken -passwordResetExpires");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user", error: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    if (req.body.email) {
      req.body.email = req.body.email.toLowerCase().trim();
      const existing = await User.findOne({
        email: req.body.email,
        _id: { $ne: req.params.id },
      });
      if (existing) {
        return res.status(409).json({ message: "Email already in use" });
      }
    }

    const updates = { ...req.body };

    if (updates.role) {
      const current = await User.findById(req.params.id).select("role");
      if (!current) {
        return res.status(404).json({ message: "User not found" });
      }
      // `findByIdAndUpdate` bypasses the document pre-validate hook, so a role
      // change used to leave the old role's permissions in place (a promoted
      // receptionist stayed locked out of receptionist endpoints).
      if (current.role !== updates.role) {
        updates.permissions = permissionsForRole(updates.role);
        updates.permissionsCustomized = false;
      }
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).select("-password -passwordResetToken -passwordResetExpires");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await logAudit(req, { action: "UPDATE_USER", resource: "User", resourceId: user._id, details: { fields: Object.keys(updates) } });

    res.status(200).json({ message: "User updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Failed to update user", error: error.message });
  }
};

const deactivateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ message: "You cannot deactivate your own account" });
    }

    user.isActive = false;
    await user.save();

    await logAudit(req, { action: "DEACTIVATE_USER", resource: "User", resourceId: user._id });

    res.status(200).json({ message: "User deactivated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to deactivate user", error: error.message });
  }
};

const activateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isActive = true;
    await user.save();

    await logAudit(req, { action: "ACTIVATE_USER", resource: "User", resourceId: user._id });

    res.status(200).json({ message: "User activated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to activate user", error: error.message });
  }
};

const getGuests = async (req, res) => {
  try {
    const { search, isActive } = req.query;
    // Anonymized (GDPR-deleted) accounts must not reappear in the guest picker.
    const filter = { role: "guest", anonymized: { $ne: true } };
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [{ name: regex }, { email: regex }];
    }
    const guests = await User.find(filter)
      .select("-password -passwordResetToken -passwordResetExpires")
      .sort({ createdAt: -1 });
    res.status(200).json({ guests });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch guest profiles", error: error.message });
  }
};

const updatePermissions = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { permissions: req.body.permissions, permissionsCustomized: true } },
      { new: true, runValidators: true }
    ).select("-password -passwordResetToken -passwordResetExpires");

    if (!user) return res.status(404).json({ message: "User not found" });
    await logAudit(req, {
      action: "UPDATE_PERMISSIONS",
      resource: "User",
      resourceId: user._id,
      details: { permissions: req.body.permissions },
    });
    res.status(200).json({ message: "Permissions updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Failed to update permissions", error: error.message });
  }
};

module.exports = {
  createStaffUser,
  getUsers,
  getUserById,
  updateUser,
  deactivateUser,
  activateUser,
  getGuests,
  updatePermissions,
};
