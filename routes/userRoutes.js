const express = require('express');
const { getUserProfile } = require('../controllers/userController');
const authenticateJWT = require('../middleware/authMiddleware');
const router = express.Router();

router.get('/profile', authenticateJWT, getUserProfile);

module.exports = router;
