const notFound = (req, res, next) => {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
};

const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  // CORS rejections are a client problem, not a server failure.
  if (err.message === "Origin not allowed by CORS") {
    return res.status(403).json({ message: err.message });
  }

  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((item) => item.message);
    return res.status(400).json({ message: messages[0] || "Validation failed" });
  }

  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid resource id" });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return res.status(409).json({
      message: field ? `${field} already exists` : "Duplicate value",
    });
  }

  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    message: err.message || "Internal server error",
  });
};

module.exports = { notFound, errorHandler };
