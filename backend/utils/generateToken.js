const jwt = require('jsonwebtoken');
const config = require('../config/environment');

function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

module.exports = generateToken;
