const SystemSetting = require("../models/SystemSetting");
const { logAudit } = require("../utils/auditLogger");
const { invalidateSetting } = require("../utils/settings");

const getSettings = async (req, res) => {
  try {
    const settings = await SystemSetting.find().sort({ key: 1 });
    res.status(200).json({ settings });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch settings", error: error.message });
  }
};

const upsertSetting = async (req, res) => {
  try {
    const { key, value, description } = req.body;
    const setting = await SystemSetting.findOneAndUpdate(
      { key: key.trim() },
      {
        key: key.trim(),
        value,
        description: description || "",
        updatedBy: req.user._id,
      },
      { new: true, upsert: true, runValidators: true }
    );

    invalidateSetting(setting.key);
    await logAudit(req, { action: "UPSERT_SETTING", resource: "SystemSetting", resourceId: setting._id, details: { key: setting.key } });

    res.status(200).json({ message: "Setting saved successfully", setting });
  } catch (error) {
    res.status(500).json({ message: "Failed to save setting", error: error.message });
  }
};

const deleteSetting = async (req, res) => {
  try {
    const setting = await SystemSetting.findByIdAndDelete(req.params.id);
    if (!setting) {
      return res.status(404).json({ message: "Setting not found" });
    }

    invalidateSetting(setting.key);
    await logAudit(req, { action: "DELETE_SETTING", resource: "SystemSetting", resourceId: req.params.id, details: { key: setting.key } });

    res.status(200).json({ message: "Setting deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete setting", error: error.message });
  }
};

module.exports = { getSettings, upsertSetting, deleteSetting };
