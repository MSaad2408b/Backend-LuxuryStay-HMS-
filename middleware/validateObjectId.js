const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * Route-level guard for `:id` params.
 *
 * Without it a malformed id (e.g. `/api/rooms/not-an-id`) reaches Mongoose,
 * throws a CastError inside the controller's try/catch and is reported as a
 * 500 "Failed to ..." response. A malformed id is a client error, so answer
 * with 400 before the controller runs.
 *
 * Registered with `router.param("id", validateObjectIdParam)`.
 */
const validateObjectIdParam = (req, res, next, value, name) => {
  if (!OBJECT_ID_PATTERN.test(String(value || ""))) {
    return res.status(400).json({ message: `Invalid ${name || "id"}` });
  }
  return next();
};

module.exports = { validateObjectIdParam, OBJECT_ID_PATTERN };
