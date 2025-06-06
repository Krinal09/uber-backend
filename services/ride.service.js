const rideModel = require('../models/ride.model');
const mapService = require('./maps.service');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getIO } = require('../socket');
const { generateOTP } = require('../utils/helpers');
const captainModel = require('../models/captain.model');

const RIDE_STATUS = {
  REQUESTED: 'requested',
  ACCEPTED: 'accepted',
  ON_THE_WAY: 'on-the-way',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

async function getFare(pickup, destination) {
    try {
        if (!pickup || !destination) {
            throw new Error('Pickup and destination are required');
        }

        // Validate the objects directly since they should already be parsed
        if (!pickup.address || !pickup.coordinates || !destination.address || !destination.coordinates) {
            throw new Error('Invalid pickup or destination object format');
        }

        console.log('Calculating distance and time for:', {
            pickup,
            destination
        });

        const distanceTime = await mapService.getDistanceTime(pickup, destination);

        if (!distanceTime.distance || !distanceTime.duration) {
            throw new Error('Could not calculate distance and duration');
        }

        console.log('Distance and time calculated:', distanceTime);

        const baseFare = {
            auto: 30,
            car: 50,
            moto: 20
        };

        const perKmRate = {
            auto: 10,
            car: 15,
            moto: 8
        };

        const perMinuteRate = {
            auto: 2,
            car: 3,
            moto: 1.5
        };

        const currentHour = new Date().getHours();
        let surgeMultiplier = 1.0;

        if ((currentHour >= 7 && currentHour <= 9) || (currentHour >= 17 && currentHour <= 19)) {
            surgeMultiplier = 1.5;
        } else if (currentHour >= 22 || currentHour <= 5) {
            surgeMultiplier = 1.3;
        }

        console.log('Calculating fare with:', {
            distance: distanceTime.distance.value,
            duration: distanceTime.duration.value,
            surgeMultiplier
        });

        const fare = {
            auto: Math.round((baseFare.auto + 
                ((distanceTime.distance.value / 1000) * perKmRate.auto) + 
                ((distanceTime.duration.value / 60) * perMinuteRate.auto)) * surgeMultiplier),
            car: Math.round((baseFare.car + 
                ((distanceTime.distance.value / 1000) * perKmRate.car) + 
                ((distanceTime.duration.value / 60) * perMinuteRate.car)) * surgeMultiplier),
            moto: Math.round((baseFare.moto + 
                ((distanceTime.distance.value / 1000) * perKmRate.moto) + 
                ((distanceTime.duration.value / 60) * perMinuteRate.moto)) * surgeMultiplier)
        };

        // Apply minimum and maximum fare limits
        Object.keys(fare).forEach(type => {
            fare[type] = Math.max(fare[type], baseFare[type] * 2);
            fare[type] = Math.min(fare[type], baseFare[type] * 10);
            fare[type] = Math.round(fare[type] / 10) * 10;
        });

        console.log('Final fare calculated:', fare);

        return {
            data: fare,
            distance: distanceTime.distance,
            duration: distanceTime.duration,
            surgeMultiplier: surgeMultiplier
        };
    } catch (error) {
        console.error('Error in getFare:', error);
        throw new Error(error.message || 'Failed to calculate fare');
    }
}

function getOtp(num) {
    function generateOtp(num) {
        const otp = crypto.randomInt(Math.pow(10, num - 1), Math.pow(10, num)).toString();
        return otp;
    }
    return generateOtp(num);
}

const createRide = async ({
    user,
    pickupObj,
    destinationObj,
    pickupString,
    destinationString,
    vehicleType,
    fareAmount,
    distance,
    duration
}) => {
    try {
        // Validate required fields
        if (!user || !pickupObj || !destinationObj || !vehicleType || fareAmount === undefined || distance === undefined || duration === undefined) {
            throw new Error('Missing required fields for ride creation');
        }

        // Validate vehicle type
        const validVehicleTypes = ['auto', 'car', 'moto'];
        if (!validVehicleTypes.includes(vehicleType)) {
            throw new Error(`Invalid vehicle type. Must be one of: ${validVehicleTypes.join(', ')}`);
        }

        // Validate coordinates
        if (!pickupObj.coordinates?.coordinates || !destinationObj.coordinates?.coordinates) {
            throw new Error('Invalid pickup or destination coordinates');
        }

        // Calculate route details with retry logic
        let routeDetails;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                routeDetails = await mapService.getRouteDetails(pickupObj, destinationObj);
                if (routeDetails && routeDetails.distance && routeDetails.duration) {
                    break;
                }
            } catch (error) {
                retryCount++;
                if (retryCount === maxRetries) {
                    throw new Error('Failed to calculate route details after multiple attempts');
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            }
        }

        // Calculate fare based on distance and vehicle type
        const baseFare = {
            auto: 30,
            car: 50,
            moto: 20
        };

        const perKmRate = {
            auto: 10,
            car: 15,
            moto: 8
        };

        const perMinuteRate = {
            auto: 2,
            car: 3,
            moto: 1.5
        };

        // Calculate surge multiplier based on time and demand
        const currentHour = new Date().getHours();
        let surgeMultiplier = 1.0;

        // Peak hours (7-9 AM and 5-7 PM)
        if ((currentHour >= 7 && currentHour <= 9) || (currentHour >= 17 && currentHour <= 19)) {
            surgeMultiplier = 1.5;
        } 
        // Late night hours (10 PM - 5 AM)
        else if (currentHour >= 22 || currentHour <= 5) {
            surgeMultiplier = 1.3;
        }

        // Calculate base fare
        const distanceInKm = routeDetails.distance / 1000;
        const durationInMinutes = routeDetails.duration / 60;

        // Apply minimum distance and duration
        const effectiveDistance = Math.max(distanceInKm, 1); // Minimum 1 km
        const effectiveDuration = Math.max(durationInMinutes, 5); // Minimum 5 minutes

        const fare = Math.round((baseFare[vehicleType] + 
            (effectiveDistance * perKmRate[vehicleType]) + 
            (effectiveDuration * perMinuteRate[vehicleType])) * surgeMultiplier);

        // Apply minimum and maximum fare limits
        const minFare = baseFare[vehicleType] * 2;
        const maxFare = baseFare[vehicleType] * 10;
        const finalFare = Math.min(Math.max(fare, minFare), maxFare);

        // Generate OTP for ride verification
        const otp = generateOTP(6);

        // Create new ride with properly structured pickup and destination
        const ride = await rideModel.create({
            user,
            pickup: {
                address: pickupString,
                coordinates: {
                    type: 'Point',
                    coordinates: [
                        pickupObj.coordinates.coordinates[0],
                        pickupObj.coordinates.coordinates[1]
                    ]
                }
            },
            destination: {
                address: destinationString,
                coordinates: {
                    type: 'Point',
                    coordinates: [
                        destinationObj.coordinates.coordinates[0],
                        destinationObj.coordinates.coordinates[1]
                    ]
                }
            },
            vehicleType,
            fare: {
                amount: finalFare,
                currency: 'USD'
            },
            distance: distance.value,
            duration: duration.value,
            otp,
            status: RIDE_STATUS.REQUESTED
        });

        return ride;
    } catch (error) {
        console.error('Error in createRide service:', error);
        throw new Error(error.message || 'Failed to create ride');
    }
};

const confirmRide = async ({ rideId, captain }) => {
    try {
        const ride = await rideModel.findOne({
            _id: rideId,
            status: RIDE_STATUS.REQUESTED
        });

        if (!ride) {
            throw new Error('Ride not found or already accepted');
        }

        // Check if captain is available
        const captainDoc = await captainModel.findById(captain._id);
        if (!captainDoc || !captainDoc.isAvailable) {
            throw new Error('Captain is not available');
        }

        // Update ride with captain details
        ride.captain = captain._id;
        ride.status = RIDE_STATUS.ACCEPTED;
        ride.estimatedArrivalTime = new Date(Date.now() + 10 * 60000); // 10 minutes from now
        await ride.save();

        // Update captain availability
        await captainModel.findByIdAndUpdate(captain._id, {
            isAvailable: false,
            lastSeen: new Date()
        });

        return ride;
    } catch (error) {
        throw new Error('Failed to confirm ride: ' + error.message);
    }
};

const startRide = async ({ rideId, otp, captain }) => {
    try {
        const ride = await rideModel.findOne({
            _id: rideId,
            captain: captain._id,
            status: RIDE_STATUS.ACCEPTED
        }).select('+otp');

        if (!ride) {
            throw new Error('Ride not found or not in correct state');
        }

        if (ride.otp !== otp) {
            throw new Error('Invalid OTP');
        }

        ride.status = RIDE_STATUS.IN_PROGRESS;
        ride.actualArrivalTime = new Date();
        await ride.save();

        return ride;
    } catch (error) {
        throw new Error('Failed to start ride: ' + error.message);
    }
};

const endRide = async ({ rideId, captain, paymentMethod, tip }) => {
    try {
        const ride = await rideModel.findOne({
            _id: rideId,
            captain: captain._id,
            status: RIDE_STATUS.IN_PROGRESS
        });

        if (!ride) {
            throw new Error('Ride not found or not in progress');
        }

        ride.status = RIDE_STATUS.COMPLETED;
        ride.actualEndTime = new Date();
        ride.paymentMethod = paymentMethod;
        if (tip) {
            ride.tip = tip;
        }
        await ride.save();

        return ride;
    } catch (error) {
        throw new Error('Failed to end ride: ' + error.message);
    }
};

const cancelRide = async ({ rideId, userId, reason }) => {
    try {
        const ride = await rideModel.findOne({
            _id: rideId,
            user: userId,
            status: { $in: [RIDE_STATUS.REQUESTED, RIDE_STATUS.ACCEPTED] }
        });

        if (!ride) {
            throw new Error('Ride not found or cannot be cancelled');
        }

        ride.status = RIDE_STATUS.CANCELLED;
        ride.cancellationReason = reason;
        await ride.save();

        return ride;
    } catch (error) {
        throw new Error('Failed to cancel ride: ' + error.message);
    }
};

const rateRide = async ({ rideId, userId, rating, review }) => {
    try {
        const ride = await rideModel.findOne({
            _id: rideId,
            user: userId,
            status: RIDE_STATUS.COMPLETED
        });

        if (!ride) {
            throw new Error('Ride not found or not completed');
        }

        ride.rating = rating;
        if (review) {
            ride.review = review;
        }
        await ride.save();

        return ride;
    } catch (error) {
        throw new Error('Failed to rate ride: ' + error.message);
    }
};

const getActiveRides = async (userId, userType) => {
    try {
        const query = userType === 'User' ? { user: userId } : { captain: userId };
        query.status = { $in: [RIDE_STATUS.REQUESTED, RIDE_STATUS.ACCEPTED, RIDE_STATUS.ON_THE_WAY, RIDE_STATUS.IN_PROGRESS] };
        
        const rides = await rideModel.find(query)
            .populate('user', 'fullname phone')
            .populate('captain', 'fullname phone vehicle')
            .sort('-createdAt');
        
        return rides;
    } catch (error) {
        throw new Error('Failed to get active rides: ' + error.message);
    }
};

const getRideHistory = async (userId, userType) => {
    try {
        const query = userType === 'User' ? { user: userId } : { captain: userId };
        query.status = { $in: [RIDE_STATUS.COMPLETED, RIDE_STATUS.CANCELLED] };
        
        const rides = await rideModel.find(query)
            .populate('user', 'fullname phone')
            .populate('captain', 'fullname phone vehicle')
            .sort('-createdAt');
        
        return rides;
    } catch (error) {
        throw new Error('Failed to get ride history: ' + error.message);
    }
};

module.exports = {
    RIDE_STATUS,
    getFare,
    createRide,
    confirmRide,
    startRide,
    endRide,
    cancelRide,
    rateRide,
    getActiveRides,
    getRideHistory
};
