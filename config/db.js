const mongoose = require("mongoose");
const config = require("./env");
const { logger } = require("../utils/logger");

mongoose.connection.on("connected", () => logger.info("mongo_connected"));
mongoose.connection.on("disconnected", () => logger.warn("mongo_disconnected"));
mongoose.connection.on("error", (error) => logger.error("mongo_error", { error: error.message }));

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectDB = async () => {
  const maxAttempts = config.isTest ? 1 : 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(config.mongoUri, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 50,
        minPoolSize: 2,
      });
      logger.info("mongo_connection_ready", { attempt });
      return mongoose.connection;
    } catch (error) {
      logger.error("mongo_connection_failed", { attempt, error: error.message });
      if (attempt === maxAttempts) throw error;
      await delay(1000 * attempt);
    }
  }
  return mongoose.connection;
};

module.exports = connectDB;
