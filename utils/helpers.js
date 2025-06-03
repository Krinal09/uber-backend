const crypto = require('crypto');
const { ApiError } = require('./errors');

/**
 * Generate a random OTP of specified length
 * @param {number} length - Length of OTP (default: 6)
 * @returns {string} Generated OTP
 */
const generateOTP = (length = 6) => {
    try {
        // Generate a random number between 10^(length-1) and 10^length - 1
        const min = Math.pow(10, length - 1);
        const max = Math.pow(10, length) - 1;
        const otp = crypto.randomInt(min, max + 1).toString();
        return otp;
    } catch (error) {
        console.error("Error generating OTP:", error);
        throw new ApiError(500, "Error generating OTP");
    }
};

/**
 * Format a date to a readable string
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
const formatDate = (date) => {
    return new Date(date).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

/**
 * Calculate time difference in minutes
 * @param {Date} startTime - Start time
 * @param {Date} endTime - End time
 * @returns {number} Time difference in minutes
 */
const getTimeDifference = (startTime, endTime) => {
    return Math.round((endTime - startTime) / (1000 * 60));
};

/**
 * Format currency amount
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
};

/**
 * Validate coordinates
 * @param {Array<number>} coordinates - [longitude, latitude]
 * @returns {boolean} Whether coordinates are valid
 */
const validateCoordinates = (coordinates) => {
    if (!Array.isArray(coordinates) || coordinates.length !== 2) {
        return false;
    }
    const [longitude, latitude] = coordinates;
    return (
        typeof longitude === 'number' &&
        typeof latitude === 'number' &&
        longitude >= -180 &&
        longitude <= 180 &&
        latitude >= -90 &&
        latitude <= 90
    );
};

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - First point latitude
 * @param {number} lon1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lon2 - Second point longitude
 * @returns {number} Distance in kilometers
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

/**
 * Generate a random string of specified length
 * @param {number} length - Length of string
 * @returns {string} Random string
 */
const generateRandomString = (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
};

/**
 * Sanitize phone number
 * @param {string} phone - Phone number to sanitize
 * @returns {string} Sanitized phone number
 */
const sanitizePhone = (phone) => {
    return phone.replace(/\D/g, '');
};

/**
 * Validate phone number
 * @param {string} phone - Phone number to validate
 * @returns {boolean} Whether phone number is valid
 */
const validatePhone = (phone) => {
    const sanitized = sanitizePhone(phone);
    return sanitized.length >= 10 && sanitized.length <= 15;
};

/**
 * Format phone number
 * @param {string} phone - Phone number to format
 * @returns {string} Formatted phone number
 */
const formatPhone = (phone) => {
    const sanitized = sanitizePhone(phone);
    if (sanitized.length === 10) {
        return `(${sanitized.slice(0, 3)}) ${sanitized.slice(3, 6)}-${sanitized.slice(6)}`;
    }
    return sanitized;
};

module.exports = {
    generateOTP,
    formatDate,
    getTimeDifference,
    formatCurrency,
    validateCoordinates,
    calculateDistance,
    generateRandomString,
    sanitizePhone,
    validatePhone,
    formatPhone
}; 