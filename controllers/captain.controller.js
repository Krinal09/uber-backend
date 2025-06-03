const captainModel = require('../models/captain.model');
const captainService = require('../services/captain.service');
const blackListTokenModel = require('../models/blacklistToken.model');
const { validationResult } = require('express-validator');

module.exports.registerCaptain = async (req, res, next) => {
    try {
        // Validate request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false,
                message: 'Validation failed',
                errors: errors.array() 
            });
        }

        const { fullname, email, password, vehicle } = req.body;

        // Validate required fields
        if (!fullname?.firstname || !email || !password || !vehicle) {
            return res.status(400).json({ 
                success: false,
                message: 'Missing required fields' 
            });
        }

        // Validate vehicle fields
        if (!vehicle.color || !vehicle.plate || !vehicle.capacity || !vehicle.vehicleType) {
            return res.status(400).json({ 
                success: false,
                message: 'Missing vehicle details' 
            });
        }

        // Hash password
        const hashedPassword = await captainModel.hashPassword(password);

        // Create captain
        const captain = await captainService.createCaptain({
            firstname: fullname.firstname,
            lastname: fullname.lastname,
            email,
            password: hashedPassword,
            color: vehicle.color,
            plate: vehicle.plate,
            capacity: vehicle.capacity,
            vehicleType: vehicle.vehicleType
        });

        // Generate token
        const token = captain.generateAuthToken();

        // Return success response
        res.status(201).json({ 
            success: true,
            data: { 
                token, 
                captain: {
                    _id: captain._id,
                    email: captain.email,
                    fullname: captain.fullname,
                    vehicle: captain.vehicle,
                    isAvailable: captain.isAvailable
                } 
            } 
        });
    } catch (error) {
        console.error('Registration error:', error);
        
        // Handle specific error types
        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                success: false,
                message: 'Validation error',
                errors: Object.values(error.errors).map(err => err.message)
            });
        }

        if (error.code === 11000) {
            return res.status(400).json({ 
                success: false,
                message: 'Email already registered' 
            });
        }

        // Generic error response
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Error during registration'
        });
    }
};

module.exports.loginCaptain = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;

        const captain = await captainModel.findOne({ email }).select('+password');

        if (!captain) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isMatch = await captain.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = captain.generateAuthToken();

        // Set token in cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.status(200).json({ 
            success: true,
            data: { 
                token, 
                captain: {
                    _id: captain._id,
                    email: captain.email,
                    fullname: captain.fullname,
                    vehicle: captain.vehicle,
                    isAvailable: captain.isAvailable
                } 
            } 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Error during login' });
    }
};

module.exports.getCaptainProfile = async (req, res, next) => {
    res.status(200).json({ 
        success: true,
        data: {
            captain: {
                _id: req.captain._id,
                email: req.captain.email,
                fullname: req.captain.fullname,
                vehicle: req.captain.vehicle,
                isAvailable: req.captain.isAvailable,
                location: req.captain.location
            }
        }
    });
};

module.exports.logoutCaptain = async (req, res, next) => {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
        if (token) {
            await blackListTokenModel.create({ token });
        }
        res.clearCookie('token');
        res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, message: 'Error during logout' });
    }
};

module.exports.updateLocation = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { location } = req.body;
        const captain = req.captain;

        captain.location = {
            type: 'Point',
            coordinates: [location.lng, location.lat]
        };
        captain.lastLocationUpdate = new Date();

        await captain.save();

        res.status(200).json({ 
            success: true,
            message: 'Location updated successfully',
            data: { location: captain.location }
        });
    } catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({ success: false, message: 'Error updating location' });
    }
};

module.exports.updateAvailability = async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { isAvailable } = req.body;
        const captain = req.captain;

        captain.isAvailable = isAvailable;
        await captain.save();

        res.status(200).json({ 
            success: true,
            message: 'Availability updated successfully',
            data: { isAvailable: captain.isAvailable }
        });
    } catch (error) {
        console.error('Error updating availability:', error);
        res.status(500).json({ success: false, message: 'Error updating availability' });
    }
};