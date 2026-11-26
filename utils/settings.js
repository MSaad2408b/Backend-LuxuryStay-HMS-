const SystemSetting = require("../models/SystemSetting");

const DEFAULT_SETTINGS = {
  tax_rate_percent: 0,
  hotel_name: "LuxuryStay Hospitality",
  currency: "INR",
  check_in_time: "14:00",
  check_out_time: "11:00",
  cancellation_hours: 24,
  email_notifications_enabled: false,
  privacy_policy_version: "v1.0",
};

const cache = new Map();
const CACHE_TTL_MS = 30 * 1000;

const getSetting = async (key, fallback) => {
  if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key) && fallback === undefined) {
    fallback = DEFAULT_SETTINGS[key];
  }
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  try {
    const setting = await SystemSetting.findOne({ key }).lean();
    const value = setting ? setting.value : fallback;
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error) {
    return fallback;
  }
};

const getNumberSetting = async (key, fallback = 0) => {
  const value = await getSetting(key, fallback);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getTaxRate = () => getNumberSetting("tax_rate_percent", 0);
const getEmailNotificationsEnabled = async () => {
  const value = await getSetting("email_notifications_enabled", false);
  return value === true || value === "true";
};

const invalidateSetting = (key) => {
  if (key) cache.delete(key);
  else cache.clear();
};

module.exports = {
  DEFAULT_SETTINGS,
  getSetting,
  getNumberSetting,
  getTaxRate,
  getEmailNotificationsEnabled,
  invalidateSetting,
};
