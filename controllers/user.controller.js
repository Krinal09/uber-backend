const userModel = require("../models/user.model");
const userService = require("../services/user.service");
const { validationResult } = require("express-validator");
const blackListTokenModel = require("../models/blackListToken.model");

module.exports.registerUser = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: "Validation error",
        errors: errors.array() 
      });
    }

    const { fullname, email, password } = req.body;

    const isUserAlready = await userModel.findOne({ email });

    if (isUserAlready) {
      return res.status(400).json({ 
        success: false,
        message: "User already exists" 
      });
    }

    const hashedPassword = await userModel.hashPassword(password);

    const user = await userService.createUser({
      firstname: fullname.firstname,
      lastname: fullname.lastname,
      email,
      password: hashedPassword,
    });

    const token = user.generateAuthToken();

    res.status(201).json({ 
      success: true,
      data: { 
        token, 
        user: {
          _id: user._id,
          email: user.email,
          fullname: user.fullname,
          profilePicture: user.profilePicture
        } 
      } 
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ 
      success: false,
      message: "Error during registration" 
    });
  }
};

module.exports.loginUser = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: "Validation error",
        errors: errors.array() 
      });
    }

    const { email, password } = req.body;

    const user = await userModel.findOne({ email }).select("+password");

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid email or password" 
      });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid email or password" 
      });
    }

    const token = user.generateAuthToken();

    res.status(200).json({ 
      success: true,
      data: { 
        token, 
        user: {
          _id: user._id,
          email: user.email,
          fullname: user.fullname,
          profilePicture: user.profilePicture
        } 
      } 
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      success: false,
      message: "Error during login" 
    });
  }
};

module.exports.getUserProfile = async (req, res, next) => {
  try {
    res.status(200).json({ 
      success: true,
      data: {
        user: {
          _id: req.user._id,
          email: req.user.email,
          fullname: req.user.fullname,
          profilePicture: req.user.profilePicture
        }
      }
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({ 
      success: false,
      message: "Error fetching profile" 
    });
  }
};

module.exports.logoutUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (token) {
      await blackListTokenModel.create({ token });
    }
    res.status(200).json({ 
      success: true, 
      message: "Logged out successfully" 
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error during logout" 
    });
  }
};
