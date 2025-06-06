const userModel = require('../models/user.model');
const jwt = require('jsonwebtoken');
const blackListTokenModel = require('../models/blackListToken.model');
const captainModel = require('../models/captain.model');

const getTokenFromRequest = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.split(' ')[1];
};

const verifyToken = async (token) => {
    if (!token) {
        throw new Error('No token provided');
    }

    const isBlacklisted = await blackListTokenModel.findOne({ token });
    if (isBlacklisted) {
        throw new Error('Token is blacklisted');
    }

    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        throw new Error('Invalid token');
    }
};

module.exports.authUser = async (req, res, next) => {
    try {
        const token = getTokenFromRequest(req);
        if (!token) {
            return res.status(401).json({ 
                success: false,
                message: 'No token provided' 
            });
        }

        const decoded = await verifyToken(token);
        const user = await userModel.findById(decoded._id);
        
        if (!user) {
            return res.status(401).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        req.user = user;
        return next();
    } catch (err) {
        console.error('Auth error:', err);
        return res.status(401).json({ 
            success: false,
            message: err.message || 'Unauthorized access' 
        });
    }
};

module.exports.authCaptain = async (req, res, next) => {
    try {
        const token = getTokenFromRequest(req);
        if (!token) {
            return res.status(401).json({ 
                success: false,
                message: 'No token provided' 
            });
        }

        const decoded = await verifyToken(token);
        const captain = await captainModel.findById(decoded._id);
        
        if (!captain) {
            return res.status(401).json({ 
                success: false,
                message: 'Captain not found' 
            });
        }

        req.captain = captain;
        return next();
    } catch (err) {
        console.error('Auth error:', err);
        return res.status(401).json({ 
            success: false,
            message: err.message || 'Unauthorized access' 
        });
    }
};
