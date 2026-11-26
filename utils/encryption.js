const crypto = require("crypto");
const config = require("../config/env");

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1";

const deriveKey = () => crypto.createHash("sha256").update(config.encryptionKey).digest();

const encrypt = (value) => {
  if (value === null || value === undefined || value === "") return value;
  if (typeof value !== "string") value = String(value);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
};

const decrypt = (value) => {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return value;
  try {
    // Accept both the current `enc:v1:iv:tag:cipher` format and the early
    // `enc:v1::iv:tag:cipher` format so existing databases stay readable.
    const parts = value.slice(PREFIX.length).replace(/^:/, "").split(":");
    if (parts.length < 3) return value;
    const [ivEncoded, tagEncoded, ...cipherParts] = parts;
    const iv = Buffer.from(ivEncoded, "base64");
    const tag = Buffer.from(tagEncoded, "base64");
    const ciphertext = Buffer.from(cipherParts.join(":"), "base64");
    const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    // Legacy/plaintext values stay readable instead of breaking the API.
    return value;
  }
};

const hash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const encryptedString = (options = {}) => ({
  type: String,
  ...options,
  set: (value) => encrypt(value),
  get: (value) => decrypt(value),
});

module.exports = { encrypt, decrypt, hash, encryptedString, PREFIX };
