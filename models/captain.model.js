const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const captainSchema = new mongoose.Schema({
  fullname: {
    firstname: {
      type: String,
      required: true,
      minlength: [3, 'Firstname must be at least 3 characters long'],
    },
    lastname: {
      type: String,
      minlength: [3, 'Lastname must be at least 3 characters long'],
    },
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
  },
  password: {
    type: String,
    required: true,
    select: false,
  },
  vehicle: {
    color: {
      type: String,
      required: true,
      minlength: [3, 'Color must be at least 3 characters long'],
    },
    plate: {
      type: String,
      required: true,
      minlength: [3, 'Plate must be at least 3 characters long'],
    },
    capacity: {
      type: Number,
      required: true,
      min: [1, 'Capacity must be at least 1'],
    },
    vehicleType: {
      type: String,
      required: true,
      enum: ['car', 'moto', 'auto']
    },
  },
  isAvailable: {
    type: Boolean,
    default: false,
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      default: [0, 0],
    },
  },
  lastLocationUpdate: {
    type: Date,
  },
  socketId: {
    type: String,
    default: null,
  },
  lastSeen: {
    type: Date,
  },
}, {
  timestamps: true
});

captainSchema.index({ location: '2dsphere' });

captainSchema.methods.generateAuthToken = function () {
  const token = jwt.sign({ _id: this._id, type: 'Captain' }, process.env.JWT_SECRET, {
    expiresIn: '24h',
  });
  return token;
};

captainSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

captainSchema.statics.hashPassword = async function (password) {
  return await bcrypt.hash(password, 10);
};

const captainModel = mongoose.model('Captain', captainSchema);
module.exports = captainModel;
