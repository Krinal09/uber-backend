const axios = require('axios');
const captainModel = require('../models/captain.model');
const NodeCache = require('node-cache');
const { ApiError } = require('../utils/errors');

// Cache configuration
const routeCache = new NodeCache({ stdTTL: 3600 }); // Cache routes for 1 hour
const geocodeCache = new NodeCache({ stdTTL: 86400 }); // Cache geocoding results for 24 hours
const trafficCache = new NodeCache({ stdTTL: 300 }); // Cache traffic data for 5 minutes

// Rate limiting configuration
const RATE_LIMIT = {
    locationUpdates: {
        maxRequests: 10,
        windowMs: 10000 // 10 seconds
    },
    geocoding: {
        maxRequests: 50,
        windowMs: 60000 // 1 minute
    }
};

// Track API requests
const requestCounters = new Map();

// Configuration for geocoding services
const GEOCODING_CONFIG = {
    nominatim: {
        url: 'https://nominatim.openstreetmap.org/search',
        params: {
            format: 'json',
            limit: 5,
            addressdetails: 1,
            'accept-language': 'en-US,en;q=0.9'
        },
        headers: {
            'User-Agent': 'Uber-Clone-App/1.0 (krinalgami@gmail.com)',
            'Accept-Language': 'en-US,en;q=0.9'
        }
    }
};

// Helper function to check rate limit
const checkRateLimit = (userId, type) => {
    const now = Date.now();
    const userRequests = requestCounters.get(userId) || {};
    const typeRequests = userRequests[type] || [];
    
    // Remove old requests
    const recentRequests = typeRequests.filter(time => now - time < RATE_LIMIT[type].windowMs);
    
    if (recentRequests.length >= RATE_LIMIT[type].maxRequests) {
        return false;
    }
    
    recentRequests.push(now);
    userRequests[type] = recentRequests;
    requestCounters.set(userId, userRequests);
    return true;
};

// Helper function to validate location accuracy
const validateLocationAccuracy = (location, lastLocation) => {
    if (!lastLocation) return true;
    
    const R = 6371e3; // Earth's radius in meters
    const φ1 = location.lat * Math.PI/180;
    const φ2 = lastLocation.lat * Math.PI/180;
    const Δφ = (location.lat - lastLocation.lat) * Math.PI/180;
    const Δλ = (location.lng - lastLocation.lng) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    const distance = R * c; // Distance in meters
    
    // If distance is too large (e.g., > 1km in 10 seconds), location might be inaccurate
    return distance <= 1000;
};

// Helper function to make geocoding requests with retry logic and caching
const makeGeocodingRequest = async (address, retries = 3) => {
    // Check cache first
    const cacheKey = `geocode:${address}`;
    const cachedResult = geocodeCache.get(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

    for (let i = 0; i < retries; i++) {
        try {
            const url = `${GEOCODING_CONFIG.nominatim.url}?${new URLSearchParams({
                ...GEOCODING_CONFIG.nominatim.params,
                q: address
            })}`;
            
            const response = await axios.get(url, {
                headers: GEOCODING_CONFIG.nominatim.headers
            });
            
            if (response.data && response.data.length > 0) {
                const result = response.data;
                geocodeCache.set(cacheKey, result);
                return result;
            }
            
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        } catch (error) {
            console.error(`Geocoding attempt ${i + 1} failed:`, error.message);
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }
    return null;
};

// Get auto-complete suggestions
const getAutoCompleteSuggestions = async (input, options = {}) => {
    if (!input || input.length < 3) {
        return [];
    }

    const {
        limit = 5,
        country = null,
        language = 'en-US',
        type = 'all' // 'address', 'poi', 'all'
    } = options;

    // Check cache first
    const cacheKey = `suggestions:${input}:${country}:${type}`;
    const cachedSuggestions = geocodeCache.get(cacheKey);
    if (cachedSuggestions) {
        return cachedSuggestions;
    }

    try {
        const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
            format: 'json',
            q: input,
            limit,
            'accept-language': language,
            addressdetails: 1,
            'feature-type': type === 'all' ? undefined : type,
            countrycodes: country || undefined
        })}`;
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Uber-Clone-App/1.0',
                'Accept-Language': language
            }
        });
        
        if (response.data && Array.isArray(response.data)) {
            const suggestions = response.data.map(item => ({
                address: item.display_name,
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon),
                display_name: item.display_name,
                type: item.type,
                importance: item.importance,
                address_details: {
                    house_number: item.address?.house_number,
                    road: item.address?.road,
                    suburb: item.address?.suburb,
                    city: item.address?.city || item.address?.town,
                    state: item.address?.state,
                    country: item.address?.country,
                    postcode: item.address?.postcode
                }
            }));

            // Sort by importance
            suggestions.sort((a, b) => b.importance - a.importance);
            
            // Cache the results
            geocodeCache.set(cacheKey, suggestions);
            return suggestions;
        }
        
        return [];
    } catch (error) {
        console.error('Error in getAutoCompleteSuggestions:', error);
        return [];
    }
};

// Get coordinates for an address
const getAddressCoordinate = async (address) => {
    try {
        const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
            format: 'json',
            q: address,
            limit: 1,
            addressdetails: 1
        })}`;
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Uber-Clone-App/1.0'
            }
        });
        
        if (response.data && response.data.length > 0) {
            const result = response.data[0];
            return {
                lat: parseFloat(result.lat),
                lng: parseFloat(result.lon),
                address: result.display_name
            };
        }
        
        throw new Error('Address not found');
    } catch (error) {
        console.error('Error in getAddressCoordinate:', error);
        throw new Error('Failed to get coordinates for address');
    }
};

// Get route details including distance and duration
const getRouteDetails = async (origin, destination) => {
    if (!origin || !destination || !origin.coordinates || !destination.coordinates ||
        !Array.isArray(origin.coordinates.coordinates) || origin.coordinates.coordinates.length !== 2 ||
        !Array.isArray(destination.coordinates.coordinates) || destination.coordinates.coordinates.length !== 2) {
        throw new ApiError(400, 'Origin and destination with valid coordinates are required');
    }

    try {
        // Check cache first
        const cacheKey = `route:${origin.coordinates.coordinates.join(',')}-${destination.coordinates.coordinates.join(',')}`;
        const cachedRoute = routeCache.get(cacheKey);
        if (cachedRoute) {
            console.log('Using cached route details');
            return cachedRoute;
        }

        const [pickupLng, pickupLat] = origin.coordinates.coordinates;
        const [destLng, destLat] = destination.coordinates.coordinates;

        // Use OSRM for route calculation
        const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${pickupLng},${pickupLat};${destLng},${destLat}?overview=full&geometries=geojson`;
        console.log('Fetching route details from OSRM:', osrmUrl);

        try {
            const response = await axios.get(osrmUrl, {
                timeout: 5000, // 5 second timeout
                headers: {
                    'User-Agent': 'Uber-Clone-App/1.0'
                }
            });

            if (response.data.code !== 'Ok' || !response.data.routes.length) {
                throw new Error('OSRM returned non-Ok code or no routes');
            }

            const route = response.data.routes[0];
            const routeDetails = {
                distance: route.distance,
                duration: route.duration,
                route: route.geometry,
                steps: route.legs[0].steps.map(step => ({
                    distance: step.distance,
                    duration: step.duration,
                    instruction: step.maneuver.type,
                    location: step.maneuver.location
                }))
            };

            // Cache the result
            routeCache.set(cacheKey, routeDetails);
            console.log('Route details fetched from OSRM and cached');
            return routeDetails;

        } catch (error) {
            console.error('Error fetching route details from OSRM:', error.message);
            if (error.response) {
                console.error('OSRM response data:', error.response.data);
                console.error('OSRM response status:', error.response.status);
                console.error('OSRM response headers:', error.response.headers);
            } else if (error.request) {
                console.error('OSRM request data:', error.request);
            } else {
                console.error('Error message:', error.message);
            }
            throw new Error('Failed to get route details from mapping service.');
        }

    } catch (error) {
        console.error('Error in getRouteDetails service:', error);
        throw new ApiError(error.statusCode || 500, error.message || 'Failed to calculate route details');
    }
};

// Get nearby captains
const getCaptainsInTheRadius = async (lat, lng, radius, vehicleType = null) => {
    try {
        const query = {
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [lng, lat]
                    },
                    $maxDistance: radius * 1000 // Convert km to meters
                }
            },
            isAvailable: true
        };

        if (vehicleType) {
            query.vehicleType = vehicleType;
        }

        return await captainModel.find(query);
    } catch (error) {
        console.error('Error in getCaptainsInTheRadius:', error);
        return [];
    }
};

// Calculate traffic multiplier based on time and location
const getTrafficMultiplier = async (coordinates, time) => {
    try {
        const cacheKey = `traffic:${coordinates.join(',')}:${time.getHours()}`;
        const cachedMultiplier = trafficCache.get(cacheKey);
        if (cachedMultiplier) {
            return cachedMultiplier;
        }

        const hour = time.getHours();
        let multiplier = 1.0;

        // Time-based adjustments
        if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
            multiplier *= 1.5; // Rush hour
        } else if (hour >= 22 || hour <= 5) {
            multiplier *= 1.3; // Late night
        }

        // Cache the result
        trafficCache.set(cacheKey, multiplier);
        return multiplier;
    } catch (error) {
        console.error('Error in getTrafficMultiplier:', error);
        return 1.0; // Default multiplier if calculation fails
    }
};

// Calculate ETA based on distance and traffic
const calculateETA = async (distance, coordinates, time) => {
    try {
        const trafficMultiplier = await getTrafficMultiplier(coordinates, time);
        const baseSpeed = 30; // Base speed in km/h
        const adjustedSpeed = baseSpeed / trafficMultiplier;
        const etaMinutes = Math.ceil((distance / 1000) / adjustedSpeed * 60);
        return etaMinutes;
    } catch (error) {
        console.error('Error in calculateETA:', error);
        return Math.ceil((distance / 1000) / 30 * 60); // Default ETA calculation
    }
};

// Get distance and time between two points using OSRM
async function getDistanceTime(pickup, destination) {
    try {
        // Check cache first
        const cacheKey = `route:${JSON.stringify(pickup)}:${JSON.stringify(destination)}`;
        const cachedRoute = routeCache.get(cacheKey);
        if (cachedRoute) {
            console.log('Using cached route data');
            return cachedRoute;
        }

        const [pickupLng, pickupLat] = pickup.coordinates.coordinates;
        const [destLng, destLat] = destination.coordinates.coordinates;
        
        // Validate coordinates
        if (isNaN(pickupLng) || isNaN(pickupLat) || isNaN(destLng) || isNaN(destLat)) {
            throw new Error('Invalid coordinates');
        }

        try {
            const url = `https://router.project-osrm.org/route/v1/driving/${pickupLng},${pickupLat};${destLng},${destLat}?overview=false`;
            
            console.log('Fetching route from OSRM:', url);
            const response = await axios.get(url, {
                timeout: 5000, // 5 second timeout
                headers: {
                    'User-Agent': 'Uber-Clone-App/1.0'
                }
            });
            
            console.log('OSRM response:', response.data);
            if (!response.data || response.data.code !== 'Ok' || !response.data.routes || !response.data.routes[0]) {
                throw new Error('Invalid response from OSRM service');
            }

            const route = response.data.routes[0];
            const result = {
                distance: { value: route.distance },
                duration: { value: route.duration }
            };

            // Cache the result
            routeCache.set(cacheKey, result);
            return result;
        } catch (osrmError) {
            console.error('OSRM service error:', osrmError.message);
            
            // Fallback to Haversine formula for distance
            const distance = calculateDistance(pickupLat, pickupLng, destLat, destLng) * 1000; // Convert to meters
            const avgSpeed = 30; // Average speed in km/h
            const duration = (distance / 1000) / avgSpeed * 3600; // Duration in seconds
            
            console.log('Using fallback calculation:', {
                distance,
                duration,
                avgSpeed
            });
            
            const result = {
                distance: { value: distance },
                duration: { value: duration }
            };

            // Cache the fallback result
            routeCache.set(cacheKey, result);
            return result;
        }
    } catch (error) {
        console.error('Error in getDistanceTime:', error.message);
        throw new Error('Failed to calculate route distance and duration');
    }
}

// Helper function to calculate distance using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const distance = R * c; // Distance in km
    return distance;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

module.exports = {
    getDistanceTime,
    getAutoCompleteSuggestions,
    getAddressCoordinate,
    getCaptainsInTheRadius,
    getRouteDetails,
    getTrafficMultiplier,
    calculateETA,
    validateLocationAccuracy
};