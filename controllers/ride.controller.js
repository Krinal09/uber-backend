const rideService = require('../services/ride.service');
const { validationResult } = require('express-validator');
const mapService = require('../services/maps.service');
const { getIO } = require('../socket');
const rideModel = require('../models/ride.model');
const captainModel = require('../models/captain.model');
const userModel = require('../models/user.model');

// Create a new ride request
module.exports.createRide = async (req, res) => {
    try {
        const { pickup, destination, vehicleType, userId } = req.body;

        if (!pickup || !destination || !vehicleType || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Parse pickup and destination if they are strings
        let pickupObj, destinationObj;
        try {
            pickupObj = typeof pickup === 'string' ? JSON.parse(pickup) : pickup;
            destinationObj = typeof destination === 'string' ? JSON.parse(destination) : destination;
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pickup or destination format'
            });
        }

        // Validate coordinates
        if (!pickupObj.coordinates?.coordinates || !destinationObj.coordinates?.coordinates) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coordinates format'
            });
        }

        // Validate user exists
        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Calculate fare first
        const fareResult = await rideService.getFare(pickupObj, destinationObj);
        if (!fareResult || !fareResult.data || !fareResult.data[vehicleType]) {
            return res.status(400).json({
                success: false,
                message: 'Failed to calculate fare'
            });
        }

        // Create ride using service
        const newRide = await rideService.createRide({
            user: userId,
            pickupObj,
            destinationObj,
            pickupString: pickupObj.address,
            destinationString: destinationObj.address,
            vehicleType,
            fareAmount: fareResult.data[vehicleType],
            distance: fareResult.distance,
            duration: fareResult.duration
        });

        // Find available captains
        const availableCaptains = await captainModel.find({
            isAvailable: true,
            'vehicle.vehicleType': vehicleType,
            lastSeen: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
        });

        // Notify available captains
        const io = getIO();
        if (availableCaptains.length > 0) {
            // Fetch the newly created ride to get the populated fare object
            // We are now sending calculated fare, distance, and duration directly
            // const rideWithFare = await rideModel.findById(newRide._id)
            //     .select('pickup destination vehicleType fare user')
            //     .populate('user', 'fullname');

            availableCaptains.forEach(captain => {
                if (captain.socketId) {
                    console.log('Emitting new-ride to captain:', captain._id, 'socketId:', captain.socketId);
                    // io.to(captain.socketId).emit('new-ride', {
                    io.emit('new-ride', {
                        rideId: newRide._id, // Use the newly created ride ID
                        pickup: pickupObj, // Use the original pickup object
                        destination: destinationObj, // Use the original destination object
                        vehicleType: vehicleType, // Use the selected vehicle type
                        fare: { // Send the calculated fare amount
                            amount: fareResult.data[vehicleType],
                            currency: 'USD' // Assuming USD as currency
                        },
                        distance: fareResult.distance.value, // Send calculated distance value
                        duration: fareResult.duration.value, // Send calculated duration value
                        user: { // Get user info from the already fetched user object
                            _id: user._id,
                            fullname: user.fullname
                        }
                    });
                }
            });
        }

        res.status(201).json({
            success: true,
            message: 'Ride created successfully',
            data: newRide
        });
    } catch (error) {
        console.error('Error creating ride:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating ride',
            error: error.message
        });
    }
};

// Confirm a ride request
module.exports.confirmRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            message: 'Validation error',
            errors: errors.array() 
        });
    }

    try {
        // Check if captain is available
        const captain = await captainModel.findById(req.captain._id);
        if (!captain.isAvailable) {
            return res.status(400).json({
                success: false,
                message: 'Captain is currently on another ride'
            });
        }

        const ride = await rideService.confirmRide({
            rideId: req.body.rideId,
            captain: req.captain
        });

        // Update captain availability
        await captainModel.findByIdAndUpdate(req.captain._id, {
            isAvailable: false,
            lastSeen: new Date()
        });

        // Get populated ride data
        const populatedRide = await rideModel.findById(ride._id)
            .populate('user', 'fullname phone')
            .populate('captain', 'fullname phone vehicle')
            .select('fare distance duration pickup destination otp');

        console.log('Populated ride data before emitting to user:', populatedRide);

        const io = getIO();
        // Notify user
        io.to(`User-${ride.user._id}`).emit('ride:status:updated', { status: 'accepted', data: populatedRide });
        // Notify captain
        io.to(`Captain-${ride.captain._id}`).emit('ride:status:updated', {
            status: 'accepted',
            data: populatedRide
        });

        return res.status(200).json({
            success: true,
            data: populatedRide
        });
    } catch (err) {
        console.error('Error in confirmRide:', err);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Start a ride
module.exports.startRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            message: 'Validation error',
            errors: errors.array() 
        });
    }

    try {
        // Validate OTP
        if (!req.query.otp || req.query.otp.length !== 6) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP format'
            });
        }

        const ride = await rideService.startRide({
            rideId: req.query.rideId,
            otp: req.query.otp,
            captain: req.captain
        });

        // Get populated ride data
        const populatedRide = await rideModel.findById(ride._id)
            .populate('user', 'fullname phone')
            .populate('captain', 'fullname phone vehicle')
            .select('-otp');

        const io = getIO();
        // Notify user
        io.to(`User-${ride.user._id}`).emit('ride:started', populatedRide);
        // Notify captain
        io.to(`Captain-${ride.captain._id}`).emit('ride:status:updated', {
            status: 'in-progress',
            data: { rideId: ride._id }
        });

        return res.status(200).json({
            success: true,
            data: populatedRide
        });
    } catch (err) {
        console.error('Error in startRide:', err);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// End a ride
module.exports.endRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const ride = await rideService.endRide({
            rideId: req.body.rideId,
            captain: req.captain,
            paymentMethod: req.body.paymentMethod,
            tip: req.body.tip
        });

        const io = getIO();
        io.to(`User-${ride.user._id}`).emit('ride:completed', ride);

        return res.status(200).json({
            success: true,
            data: ride
        });
    } catch (err) {
        console.error('Error in endRide:', err);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Cancel a ride
module.exports.cancelRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const ride = await rideService.cancelRide({
            rideId: req.body.rideId,
            userId: req.user._id,
            reason: req.body.reason
        });

        const io = getIO();
        io.to(`User-${ride.user._id}`).emit('ride:cancelled', {
            rideId: ride._id,
            reason: req.body.reason
        });

        if (ride.captain) {
            io.to(`Captain-${ride.captain._id}`).emit('ride:cancelled', {
                rideId: ride._id,
                reason: req.body.reason
            });
        }

        return res.status(200).json({
            success: true,
            data: ride
        });
    } catch (err) {
        console.error('Error in cancelRide:', err);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Rate a completed ride
module.exports.rateRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const ride = await rideService.rateRide({
            rideId: req.body.rideId,
            userId: req.user._id,
            rating: req.body.rating,
            review: req.body.review
        });

        const io = getIO();
        io.to(`Captain-${ride.captain._id}`).emit('new-rating', {
            rideId: ride._id,
            rating: req.body.rating,
            review: req.body.review
        });

        return res.status(200).json({
            success: true,
            data: ride
        });
    } catch (err) {
        console.error('Error in rateRide:', err);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Get active rides
module.exports.getActiveRides = async (req, res) => {
    try {
        const rides = await rideService.getActiveRides(req.user._id, req.user.type);
        return res.status(200).json({
            success: true,
            data: rides
        });
    } catch (err) {
        console.error('Error in getActiveRides:', err);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Get ride history
module.exports.getRideHistory = async (req, res) => {
    try {
        const rides = await rideService.getRideHistory(req.user._id, req.user.type);
        return res.status(200).json({
            success: true,
            data: rides
        });
    } catch (err) {
        console.error('Error in getRideHistory:', err);
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

module.exports.getFare = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            message: 'Validation error',
            errors: errors.array() 
        });
    }

    const { pickup, destination } = req.query;

    try {
        console.log('Calculating fare for:', { pickup, destination });
        
        // Validate query parameters
        if (!pickup || !destination) {
            return res.status(400).json({ 
                success: false,
                message: 'Pickup and destination are required' 
            });
        }

        // Try to parse the JSON strings
        let pickupObj, destinationObj;
        try {
            pickupObj = JSON.parse(pickup);
            destinationObj = JSON.parse(destination);
        } catch (error) {
            console.error('JSON parse error:', error);
            return res.status(400).json({ 
                success: false,
                message: 'Invalid JSON format for pickup or destination' 
            });
        }

        const result = await rideService.getFare(pickupObj, destinationObj);
        console.log('Fare calculated successfully:', result);
        
        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (err) {
        console.error('Error in getFare controller:', err);
        
        // Determine the appropriate status code based on the error message
        let statusCode = 500;
        let errorMessage = 'Internal server error';

        if (err.message.includes('Invalid') || 
            err.message.includes('required') || 
            err.message.includes('format') || 
            err.message.includes('range')) {
            statusCode = 400;
            errorMessage = err.message;
        } else if (err.message.includes('OSRM service') || 
                   err.message.includes('calculate route')) {
            statusCode = 503;
            errorMessage = 'Service temporarily unavailable. Please try again later.';
        }

        return res.status(statusCode).json({ 
            success: false,
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
};

module.exports.updateRideStatus = async (req, res) => {
    try {
        const { rideId } = req.params;
        const { status, data } = req.body;

        const ride = await rideModel.findById(rideId);
        if (!ride) {
            return res.status(404).json({
                success: false,
                message: 'Ride not found'
            });
        }

        // Validate status transition
        const validTransitions = {
            'requested': ['accepted', 'cancelled'],
            'accepted': ['on-the-way', 'cancelled'],
            'on-the-way': ['in-progress', 'cancelled'],
            'in-progress': ['completed', 'cancelled'],
            'completed': [],
            'cancelled': []
        };

        if (!validTransitions[ride.status].includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status transition from ${ride.status} to ${status}`
            });
        }

        // Update ride status
        ride.status = status;
        
        // Handle specific status updates
        switch (status) {
            case 'accepted':
                if (req.user.type !== 'Captain') {
                    return res.status(403).json({
                        success: false,
                        message: 'Only captain can accept rides'
                    });
                }
                ride.captain = req.user._id;
                await captainModel.findByIdAndUpdate(req.user._id, {
                    isAvailable: false,
                    lastSeen: new Date()
                });
                break;

            case 'on-the-way':
                if (req.user.type !== 'Captain') {
                    return res.status(403).json({
                        success: false,
                        message: 'Only captain can update ride to on-the-way'
                    });
                }
                ride.estimatedArrivalTime = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
                break;

            case 'in-progress':
                if (req.user.type !== 'Captain') {
                    return res.status(403).json({
                        success: false,
                        message: 'Only captain can start rides'
                    });
                }
                if (data.otp && ride.otp !== data.otp) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid OTP'
                    });
                }
                ride.actualArrivalTime = new Date();
                break;

            case 'completed':
                if (req.user.type !== 'Captain') {
                    return res.status(403).json({
                        success: false,
                        message: 'Only captain can complete rides'
                    });
                }
                ride.actualEndTime = new Date();
                await captainModel.findByIdAndUpdate(ride.captain, {
                    isAvailable: true,
                    lastSeen: new Date()
                });
                break;

            case 'cancelled':
                ride.cancellationReason = data.reason || 'Cancelled by user';
                if (ride.captain) {
                    await captainModel.findByIdAndUpdate(ride.captain, {
                        isAvailable: true,
                        lastSeen: new Date()
                    });
                }
                break;
        }

        await ride.save();

        // Notify all parties
        const io = getIO();
        io.to(`User-${ride.user}`).emit('ride:status:updated', {
            status,
            data: { rideId: ride._id, ...data }
        });

        if (ride.captain) {
            io.to(`Captain-${ride.captain}`).emit('ride:status:updated', {
                status,
                data: { rideId: ride._id, ...data }
            });
        }

        res.json({
            success: true,
            message: 'Ride status updated successfully',
            data: ride
        });
    } catch (error) {
        console.error('Error updating ride status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating ride status',
            error: error.message
        });
    }
};