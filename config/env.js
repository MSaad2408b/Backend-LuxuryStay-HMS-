require("dotenv").config({ quiet: true });

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const isTest = nodeEnv === "test";

const config = {
  nodeEnv,
  isProduction,
  isTest,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/luxurystay_hms",
  jwtSecret: process.env.JWT_SECRET || "dev-only-change-me",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || "dev-only-refresh-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "2d",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  encryptionKey: process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "dev-only-encryption-key",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  corsOrigins: (process.env.CORS_ORIGINS || process.env.CLIENT_URL || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  enforceHttps: process.env.ENFORCE_HTTPS === "true" || isProduction,
  consentVersion: process.env.PRIVACY_POLICY_VERSION || "v1.0",
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 300,
    authMax: Number(process.env.AUTH_RATE_LIMIT_MAX) || 20,
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@luxurystay.example",
  },
  backup: {
    enabled: process.env.BACKUP_ENABLED === "true",
    cron: process.env.BACKUP_CRON || "0 2 * * *",
    dir: process.env.BACKUP_DIR || "./backups",
    retentionDays: Number(process.env.BACKUP_RETENTION_DAYS) || 7,
  },
};

const assertProductionSecrets = () => {
  if (!isProduction) return;
  const missing = [];
  if (!process.env.JWT_SECRET || config.jwtSecret === "dev-only-change-me") missing.push("JWT_SECRET");
  if (!process.env.JWT_REFRESH_SECRET) missing.push("JWT_REFRESH_SECRET");
  if (!process.env.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");
  if (!process.env.MONGO_URI) missing.push("MONGO_URI");
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
};

module.exports = config;
module.exports.assertProductionSecrets = assertProductionSecrets;
