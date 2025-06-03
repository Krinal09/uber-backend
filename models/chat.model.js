const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
    rideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride', // Assuming you have a Ride model
        required: true,
    },
    sender: {
        type: String, // 'user' or 'captain'
        required: true,
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'sender', // Dynamically reference either User or Captain model
    },
    text: {
        type: String,
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat; 