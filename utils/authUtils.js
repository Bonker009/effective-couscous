const jwt = require('jsonwebtoken');

const generateToken = (userId) => {
    const payload = { userId };
    const options = { expiresIn: process.env.JWT_EXPIRATION };

    return jwt.sign(payload, process.env.JWT_SECRET, options);
};

module.exports = { generateToken };
