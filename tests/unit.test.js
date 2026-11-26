const { encrypt, decrypt, hash } = require("../utils/encryption");
const { registerSchema } = require("../validation/authSchema");
const { calculateTotals } = require("../services/invoiceService");
const { permissionsForRole } = require("../config/permissions");
const { DEFAULT_SETTINGS } = require("../utils/settings");

describe("Pure utilities and validation", () => {
  it("encrypts and decrypts round-trip and hashes deterministically", () => {
    const value = "9876543210";
    const encrypted = encrypt(value);
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain(value);
    expect(decrypt(encrypted)).toBe(value);
    expect(decrypt(value)).toBe(value);
    expect(hash(value)).toBe(hash(value));
  });

  it("defaults privacy consent to accepted in registration", () => {
    const { error, value } = registerSchema.validate({
      name: "Test User",
      email: "test@example.com",
      contact: "9876543210",
      address: "123 Street",
      password: "Password123",
    });
    expect(error).toBeUndefined();
    expect(value.acceptPrivacyPolicy).toBe(true);
  });

  it("rejects registration without required fields", () => {
    const { error } = registerSchema.validate({ email: "bad@example.com" });
    expect(error).toBeTruthy();
  });

  it("calculates invoice totals with tax and discount", () => {
    const totals = calculateTotals([{ amount: 1000 }, { amount: 250 }], 100, 50);
    expect(totals).toEqual({ subtotal: 1250, totalAmount: 1300 });
  });

  it("assigns role-based permissions", () => {
    expect(permissionsForRole("admin")).toContain("manage_users");
    expect(permissionsForRole("guest")).not.toContain("manage_rooms");
    expect(permissionsForRole("housekeeping")).toContain("manage_housekeeping");
  });

  it("defines operational defaults for settings", () => {
    expect(DEFAULT_SETTINGS).toHaveProperty("tax_rate_percent");
    expect(DEFAULT_SETTINGS).toHaveProperty("email_notifications_enabled");
  });
});
