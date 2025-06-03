const captainController = require('../controllers/captain.controller');
const express = require('express');
const router = express.Router();
const { body } = require("express-validator")
const authMiddleware = require('../middlewares/auth.middleware');

// Register a new captain
router.post('/register', [
    body('email').isEmail().withMessage('Invalid Email'),
    body('fullname.firstname').isLength({ min: 3 }).withMessage('First name must be at least 3 characters long'),
    body('fullname.lastname').optional().isLength({ min: 3 }).withMessage('Last name must be at least 3 characters long'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
    body('vehicle.color').isLength({ min: 3 }).withMessage('Color must be at least 3 characters long'),
    body('vehicle.plate').isLength({ min: 3 }).withMessage('Plate must be at least 3 characters long'),
    body('vehicle.capacity').isInt({ min: 1 }).withMessage('Capacity must be at least 1'),
    body('vehicle.vehicleType').isIn(['car', 'motorcycle', 'auto']).withMessage('Invalid vehicle type')
  ], captainController.registerCaptain);

// Login captain
router.post('/login', [
    body('email').isEmail().withMessage('Invalid Email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
],
    captainController.loginCaptain
);

// Get captain profile
router.get('/profile', authMiddleware.authCaptain, captainController.getCaptainProfile);

// Logout captain
router.post('/logout', authMiddleware.authCaptain, captainController.logoutCaptain);

// Update captain location
router.post('/location', authMiddleware.authCaptain, [
    body('location.lat').isFloat().withMessage('Invalid latitude'),
    body('location.lng').isFloat().withMessage('Invalid longitude')
], captainController.updateLocation);

// Update captain availability
router.post('/availability', authMiddleware.authCaptain, [
    body('isAvailable').isBoolean().withMessage('Invalid availability status')
], captainController.updateAvailability);

module.exports = router;