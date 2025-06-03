/**
 * Validates coordinates object
 * @param {Object} coordinates - The coordinates object to validate
 * @returns {boolean} - Whether the coordinates are valid
 */
exports.validateCoordinates = (coordinates) => {
    if (!coordinates || typeof coordinates !== 'object') {
        return false;
    }

    const { type, coordinates: coords } = coordinates;

    if (type !== 'Point' || !Array.isArray(coords) || coords.length !== 2) {
        return false;
    }

    const [lng, lat] = coords;
    return (
        typeof lng === 'number' &&
        typeof lat === 'number' &&
        lng >= -180 &&
        lng <= 180 &&
        lat >= -90 &&
        lat <= 90
    );
};

/**
 * Validates address object
 * @param {Object} address - The address object to validate
 * @returns {boolean} - Whether the address is valid
 */
exports.validateAddress = (address) => {
    if (!address || typeof address !== 'object') {
        return false;
    }

    const { address: addr, coordinates } = address;

    if (typeof addr !== 'string' || !addr.trim()) {
        return false;
    }

    return this.validateCoordinates(coordinates);
};

/**
 * Validates vehicle type
 * @param {string} vehicleType - The vehicle type to validate
 * @returns {boolean} - Whether the vehicle type is valid
 */
exports.validateVehicleType = (vehicleType) => {
    const validTypes = ['auto', 'car', 'moto'];
    return validTypes.includes(vehicleType);
};

/**
 * Validates payment method
 * @param {string} paymentMethod - The payment method to validate
 * @returns {boolean} - Whether the payment method is valid
 */
exports.validatePaymentMethod = (paymentMethod) => {
    const validMethods = ['cash', 'card', 'wallet'];
    return validMethods.includes(paymentMethod);
};

/**
 * Validates rating
 * @param {number} rating - The rating to validate
 * @returns {boolean} - Whether the rating is valid
 */
exports.validateRating = (rating) => {
    return typeof rating === 'number' && rating >= 1 && rating <= 5;
};

/**
 * Validates email
 * @param {string} email - The email to validate
 * @returns {boolean} - Whether the email is valid
 */
exports.validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

/**
 * Validates password strength
 * @param {string} password - The password to validate
 * @returns {boolean} - Whether the password is strong enough
 */
exports.validatePassword = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return (
        password.length >= minLength &&
        hasUpperCase &&
        hasLowerCase &&
        hasNumbers &&
        hasSpecialChar
    );
}; 