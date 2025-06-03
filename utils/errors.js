/**
 * Custom API Error class
 * @extends Error
 */
class ApiError extends Error {
    /**
     * Create a new API Error
     * @param {number} statusCode - HTTP status code
     * @param {string} message - Error message
     */
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Bad Request Error (400)
 * @extends ApiError
 */
class BadRequestError extends ApiError {
    constructor(message = 'Bad request') {
        super(400, message);
    }
}

/**
 * Unauthorized Error (401)
 * @extends ApiError
 */
class UnauthorizedError extends ApiError {
    constructor(message = 'Unauthorized') {
        super(401, message);
    }
}

/**
 * Forbidden Error (403)
 * @extends ApiError
 */
class ForbiddenError extends ApiError {
    constructor(message = 'Forbidden') {
        super(403, message);
    }
}

/**
 * Not Found Error (404)
 * @extends ApiError
 */
class NotFoundError extends ApiError {
    constructor(message = 'Resource not found') {
        super(404, message);
        this.name = 'NotFoundError';
    }
}

/**
 * Conflict Error (409)
 * @extends ApiError
 */
class ConflictError extends ApiError {
    constructor(message = 'Resource already exists') {
        super(409, message);
        this.name = 'ConflictError';
    }
}

/**
 * Validation Error (422)
 * @extends ApiError
 */
class ValidationError extends ApiError {
    constructor(message) {
        super(400, message);
        this.name = 'ValidationError';
    }
}

/**
 * Too Many Requests Error (429)
 * @extends ApiError
 */
class TooManyRequestsError extends ApiError {
    constructor(message = 'Too many requests') {
        super(429, message);
    }
}

/**
 * Internal Server Error (500)
 * @extends ApiError
 */
class InternalServerError extends ApiError {
    constructor(message = 'Internal server error') {
        super(500, message, false);
    }
}

/**
 * Service Unavailable Error (503)
 * @extends ApiError
 */
class ServiceUnavailableError extends ApiError {
    constructor(message = 'Service unavailable') {
        super(503, message, false);
    }
}

/**
 * Authentication Error (401)
 * @extends ApiError
 */
class AuthenticationError extends ApiError {
    constructor(message = 'Authentication failed') {
        super(401, message);
        this.name = 'AuthenticationError';
    }
}

/**
 * Authorization Error (403)
 * @extends ApiError
 */
class AuthorizationError extends ApiError {
    constructor(message = 'Not authorized') {
        super(403, message);
        this.name = 'AuthorizationError';
    }
}

/**
 * Rate Limit Error (429)
 * @extends ApiError
 */
class RateLimitError extends ApiError {
    constructor(message = 'Too many requests') {
        super(429, message);
        this.name = 'RateLimitError';
    }
}

/**
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // Log error in development
    if (process.env.NODE_ENV === 'development') {
        console.error('Error:', err);
    }

    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation Error',
            errors: Object.values(err.errors).map(e => ({
                field: e.path,
                message: e.message
            }))
        });
    }

    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Token expired'
        });
    }

    // Handle mongoose duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        return res.status(409).json({
            success: false,
            message: `Duplicate field value: ${field}`
        });
    }

    // Handle mongoose cast error
    if (err.name === 'CastError') {
        return res.status(400).json({
            success: false,
            message: `Invalid ${err.path}: ${err.value}`
        });
    }

    // Default error response
    res.status(err.statusCode).json({
        success: false,
        message: err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = {
    ApiError,
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    ValidationError,
    TooManyRequestsError,
    InternalServerError,
    ServiceUnavailableError,
    AuthenticationError,
    AuthorizationError,
    RateLimitError,
    errorHandler
}; 