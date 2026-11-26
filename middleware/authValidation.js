const { registerSchema, loginSchema } = require("../validation/authSchema");

// Register Validation
const validateRegister = (req, res, next) => {
  const { error, value } = registerSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      message: error.details[0].message,
    });
  }

  req.body = value;
  next();
};

// Login Validation
const validateLogin = (req, res, next) => {
  const { error, value } = loginSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      message: error.details[0].message,
    });
  }

  req.body = value;
  next();
};

module.exports = {
  validateRegister,
  validateLogin,
};