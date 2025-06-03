const mapService = require("../services/maps.service");
const { validationResult } = require("express-validator");

module.exports.getCoordinates = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { address } = req.query;

  try {
    const coordinates = await mapService.getAddressCoordinate(address);
    if (!coordinates) {
      return res.status(404).json({ message: "Coordinates not found" });
    }
    res.status(200).json(coordinates);
  } catch (error) {
    console.error('Error in getCoordinates:', error);
    res.status(500).json({ message: "Error fetching coordinates" });
  }
};

module.exports.getDistanceTime = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { origin, destination } = req.query;

    const distanceTime = await mapService.getDistanceTime(origin, destination);
    if (!distanceTime) {
      return res.status(404).json({ message: "Route not found" });
    }

    res.status(200).json(distanceTime);
  } catch (err) {
    console.error('Error in getDistanceTime:', err);
    res.status(500).json({ message: "Error calculating route" });
  }
};

module.exports.getAutoCompleteSuggestions = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      input,
      limit = 5,
      country = null,
      language = 'en-US',
      type = 'all'
    } = req.query;

    if (!input || input.length < 3) {
      return res.status(200).json([]);
    }

    const options = {
      limit: parseInt(limit),
      country,
      language,
      type: ['address', 'poi', 'all'].includes(type) ? type : 'all'
    };

    const suggestions = await mapService.getAutoCompleteSuggestions(input, options);
    res.status(200).json(suggestions);
  } catch (err) {
    console.error('Error in getAutoCompleteSuggestions:', err);
    res.status(200).json([]);
  }
};

module.exports.getRoute = async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ message: 'Start and end coordinates are required' });
    }
    // Parse as [lat, lng]
    const startArr = start.split(',').map(Number);
    const endArr = end.split(',').map(Number);
    if (startArr.length !== 2 || endArr.length !== 2) {
      return res.status(400).json({ message: 'Invalid coordinates format' });
    }
    const route = await mapService.getRouteDetails(
      { coordinates: startArr },
      { coordinates: endArr }
    );
    if (!route) {
      return res.status(404).json({ message: 'Route not found' });
    }
    res.status(200).json(route);
  } catch (error) {
    console.error('Error in getRoute:', error);
    res.status(500).json({ message: 'Error fetching route' });
  }
};