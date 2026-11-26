const mongoose = require("mongoose");
const config = require("./config/env");
const { app, connectDB } = require("./app");
const { logger } = require("./utils/logger");
const { startBackupScheduler, stopBackupScheduler } = require("./utils/backup");

config.assertProductionSecrets();

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled_rejection", { reason: String(reason?.stack || reason) });
});
process.on("uncaughtException", (error) => {
  logger.error("uncaught_exception", { error: error.stack || error.message });
});

const server = connectDB()
  .then(() => {
    startBackupScheduler();
    return app.listen(config.port, () => {
      logger.info("server_started", { port: config.port, env: config.nodeEnv });
    });
  })
  .catch((error) => {
    logger.error("server_start_failed", { error: error.message });
    process.exit(1);
  });

const shutdown = async (signal) => {
  logger.info("shutdown_started", { signal });
  stopBackupScheduler();
  try {
    const listeningServer = await server;
    if (listeningServer?.close) {
      await new Promise((resolve) => listeningServer.close(resolve));
    }
    await mongoose.disconnect();
    logger.info("shutdown_complete");
    process.exit(0);
  } catch (error) {
    logger.error("shutdown_failed", { error: error.message });
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = server;
