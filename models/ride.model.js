const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    captain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Captain'
    },
    pickup: {
        address: {
            type: String,
            required: true
        },
        coordinates: {
            type: {
                type: String,
                enum: ['Point'],
                default: 'Point'
            },
            coordinates: {
                type: [Number],
                required: true
            }
        }
    },
    destination: {
        address: {
            type: String,
            required: true
        },
        coordinates: {
            type: {
                type: String,
                enum: ['Point'],
                default: 'Point'
            },
            coordinates: {
                type: [Number],
                required: true
            }
        }
    },
    vehicleType: {
        type: String,
        required: true,
        enum: ['car', 'moto', 'auto']
    },
    status: {
        type: String,
        required: true,
        enum: ['requested', 'accepted', 'on-the-way', 'in-progress', 'completed', 'cancelled'],
        default: 'requested'
    },
    fare: {
        amount: {
            type: Number,
            required: true,
            min: [0, 'Fare amount cannot be negative']
        },
        currency: {
            type: String,
            default: 'USD'
        }
    },
    estimatedArrivalTime: {
        type: Date,
        validate: {
            validator: function(v) {
                return v > new Date();
            },
            message: 'Estimated arrival time must be in the future'
        }
    },
    actualArrivalTime: Date,
    actualEndTime: Date,
    cancellationReason: String,
    otp: {
        type: String,
        required: true,
        length: 6,
        validate: {
            validator: function(v) {
                return /^\d{6}$/.test(v);
            },
            message: 'OTP must be exactly 6 digits'
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for common queries
rideSchema.index({ 'pickup.coordinates': '2dsphere' });
rideSchema.index({ status: 1 });
rideSchema.index({ user: 1, status: 1 });
rideSchema.index({ captain: 1, status: 1 });
rideSchema.index({ createdAt: -1 });

const rideModel = mongoose.model('Ride', rideSchema);

module.exports = rideModel;