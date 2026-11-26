const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const config = require("../config/env");
const { logger } = require("./logger");

const ensureDir = (dir) => fs.promises.mkdir(dir, { recursive: true });

const pruneOldBackups = async (dir, retentionDays) => {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const full = path.join(dir, entry.name);
        const stat = await fs.promises.stat(full);
        if (stat.mtimeMs < cutoff) {
          await fs.promises.rm(full, { recursive: true, force: true });
          logger.info("backup_pruned", { path: full });
        }
      })
  );
};

const runBackup = async () => {
  const dir = path.resolve(config.backup.dir);
  await ensureDir(dir);
  const target = path.join(dir, `hms-${new Date().toISOString().replace(/[:.]/g, "-")}`);

  return new Promise((resolve) => {
    const child = spawn("mongodump", ["--uri", config.mongoUri, "--out", target], {
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      logger.error("backup_failed", { error: error.message });
      resolve({ success: false, reason: error.message });
    });
    child.on("close", (code) => {
      if (code === 0) {
        pruneOldBackups(dir, config.backup.retentionDays)
          .then(() => {
            logger.info("backup_completed", { path: target });
            resolve({ success: true, path: target });
          })
          .catch((error) => {
            logger.error("backup_prune_failed", { error: error.message });
            resolve({ success: true, path: target, pruneError: error.message });
          });
      } else {
        logger.error("backup_failed", { code, stderr: stderr.trim() });
        resolve({ success: false, reason: stderr.trim() || `mongodump exited with ${code}` });
      }
    });
  });
};

let scheduledTask = null;

const startBackupScheduler = () => {
  if (!config.backup.enabled || scheduledTask) return false;
  if (!cron.validate(config.backup.cron)) {
    logger.warn("backup_invalid_cron", { cron: config.backup.cron });
    return false;
  }
  scheduledTask = cron.schedule(config.backup.cron, () => {
    runBackup().catch((error) => logger.error("backup_unexpected_error", { error: error.message }));
  });
  logger.info("backup_scheduler_started", { cron: config.backup.cron, dir: config.backup.dir });
  return true;
};

const stopBackupScheduler = () => {
  if (scheduledTask) scheduledTask.stop();
  scheduledTask = null;
};

module.exports = { runBackup, startBackupScheduler, stopBackupScheduler };
