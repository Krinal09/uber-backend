const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const mapController = require('../controllers/map.controller');
const rideController = require('../controllers/ride.controller');
const { query, body } = require('express-validator');

// Map related routes
router.get('/get-coordinates',
    query('address').isString().isLength({ min: 3 }),
    authMiddleware.authUser,
    mapController.getCoordinates
);

router.get('/get-distance-time',
    query('origin').isString().isLength({ min: 3 }),
    query('destination').isString().isLength({ min: 3 }),
    authMiddleware.authUser,
    mapController.getDistanceTime
);

router.get('/get-suggestions',
    query('input').isString().isLength({ min: 3 }),
    authMiddleware.authUser,
    mapController.getAutoCompleteSuggestions
);

router.get('/get-route',
    query('start').isString().isLength({ min: 3 }),
    query('end').isString().isLength({ min: 3 }),
    authMiddleware.authUser,
    mapController.getRoute
);

// Ride related routes
router.get('/get-fare',
    query('pickup').isString(),
    query('destination').isString(),
    authMiddleware.authUser,
    rideController.getFare
);

// Create new ride
router.post('/create',
    [
      body('pickup.address').isString().notEmpty(),
      body('pickup.coordinates.type').equals('Point').withMessage('Pickup coordinates type must be Point'),
      body('pickup.coordinates.coordinates').isArray({ min: 2, max: 2 }).withMessage('Pickup coordinates must be an array of 2 numbers').notEmpty(),
      body('pickup.coordinates.coordinates.*').isNumeric().withMessage('Pickup coordinates must be numeric'),
      body('destination.address').isString().notEmpty(),
      body('destination.coordinates.type').equals('Point').withMessage('Destination coordinates type must be Point'),
      body('destination.coordinates.coordinates').isArray({ min: 2, max: 2 }).withMessage('Destination coordinates must be an array of 2 numbers').notEmpty(),
      body('destination.coordinates.coordinates.*').isNumeric().withMessage('Destination coordinates must be numeric'),
      body('vehicleType').isString().notEmpty(),
      body('fare.amount').isNumeric().withMessage('Fare amount must be numeric').notEmpty(),
      body('fare.currency').isString().notEmpty()
    ],
    authMiddleware.authUser,
    rideController.createRide
  );

// Confirm ride by captain
router.post('/confirm',
    [
        body('rideId').isMongoId(),
    ],
    authMiddleware.authCaptain,
    rideController.confirmRide
);

// Start ride
router.post('/start',
    [
        query('rideId').isMongoId(),
        query('otp').isString().isLength({ min: 6, max: 6 })
    ],
    authMiddleware.authCaptain,
    rideController.startRide
);

// End ride
router.post('/end',
    [
        body('rideId').isMongoId(),
        body('paymentMethod').isString().optional(),
        body('tip').isNumeric().optional()
    ],
    authMiddleware.authCaptain,
    rideController.endRide
);

// Cancel ride
router.post('/cancel',
    [
        body('rideId').isMongoId(),
        body('reason').isString().optional()
    ],
    authMiddleware.authUser,
    rideController.cancelRide
);

// Rate ride
router.post('/rate',
    [
        body('rideId').isMongoId(),
        body('rating').isInt({ min: 1, max: 5 }),
        body('review').isString().optional()
    ],
    authMiddleware.authUser,
    rideController.rateRide
);

// Get active rides
router.get('/active',
    authMiddleware.authUser,
    rideController.getActiveRides
);

// Get ride history
router.get('/history',
    authMiddleware.authUser,
    rideController.getRideHistory
);

module.exports = router;