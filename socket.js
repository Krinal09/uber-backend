const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const userModel = require('./models/user.model');
const captainModel = require('./models/captain.model');
const blackListTokenModel = require('./models/blacklistToken.model');
const Chat = require('./models/chat.model');
const rideModel = require('./models/ride.model');

let io;

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const isBlacklisted = await blackListTokenModel.findOne({ token });
      if (isBlacklisted) {
        return next(new Error('Authentication error: Token has been invalidated'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (!decoded || !decoded._id) {
        return next(new Error('Authentication error: Invalid token format'));
      }

      const userType = decoded.type;

      if (userType === 'User') {
        const user = await userModel.findById(decoded._id);
        if (!user) {
          return next(new Error('User not found'));
        }
        socket.user = { id: user._id, type: 'User' };
      } else if (userType === 'Captain') {
        const captain = await captainModel.findById(decoded._id);
        if (!captain) {
          return next(new Error('Captain not found'));
        }
        socket.user = { id: captain._id, type: 'Captain' };
        // Update captain's socket ID and availability
        await captainModel.findByIdAndUpdate(
          captain._id,
          {
            socketId: socket.id,
            isAvailable: true,
            lastSeen: new Date()
          }
        );
        // Print the updated captain document to the console
        const updatedCaptain = await captainModel.findById(captain._id);
        console.log('Updated Captain after socket connect:', {
          _id: updatedCaptain._id,
          socketId: updatedCaptain.socketId,
          isAvailable: updatedCaptain.isAvailable,
          lastSeen: updatedCaptain.lastSeen,
          vehicle: updatedCaptain.vehicle
        });
      } else {
        return next(new Error('Authentication error: Invalid token type'));
      }

      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      if (error.name === 'JsonWebTokenError') {
        return next(new Error('Authentication error: Invalid token'));
      }
      if (error.name === 'TokenExpiredError') {
        return next(new Error('Authentication error: Token expired'));
      }
      return next(new Error('Authentication error: ' + error.message));
    }
  });

  io.on('connection', (socket) => {
    console.log(`${socket.user.type} connected:`, socket.user.id);

    // Join user's personal room
    socket.join(`${socket.user.type}-${socket.user.id}`);

    // Handle ride-related events
    socket.on('join:ride', ({ rideId }) => {
      if (!rideId) {
        socket.emit('error', { message: 'Invalid ride ID' });
        return;
      }
      socket.join(rideId);
      console.log(`${socket.user.type} ${socket.user.id} joined ride ${rideId}`);
    });

    // --- Chat Related Events ---

    // Handle joining a ride chat room and fetching history
    socket.on('join-ride-chat', async (rideId) => {
        if (!rideId) {
            socket.emit('message-error', { error: 'Invalid ride ID for chat' });
            return;
        }
        socket.join(`chat-${rideId}`);
        console.log(`${socket.user.type} ${socket.user.id} joined chat room for ride ${rideId}`);

        try {
            const history = await Chat.find({ rideId }).sort('timestamp');
            socket.emit('message-history', history);
        } catch (error) {
            console.error('Error fetching chat history:', error);
            socket.emit('message-error', { error: 'Failed to load chat history' });
        }
    });

    // Handle sending a message
    socket.on('send-message', async (messageData) => {
        try {
            if (!messageData || !messageData.rideId || !messageData.text || !messageData.sender || !messageData.senderId) {
                throw new Error('Invalid message data');
            }

            const chatMessage = new Chat({
                rideId: messageData.rideId,
                sender: messageData.sender,
                senderId: messageData.senderId,
                text: messageData.text,
                status: 'sent' // Initial status
            });

            await chatMessage.save();

            // Emit the message to all users in the ride's chat room
            io.to(`chat-${messageData.rideId}`).emit('receive-message', chatMessage);

        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('message-error', { error: error.message || 'Failed to send message' });
        }
    });

    // Handle typing indicator
    socket.on('typing', ({ rideId, isTyping }) => {
        // Broadcast typing status to the other user in the ride's chat room
        socket.to(`chat-${rideId}`).emit('user-typing', { userId: socket.user.id, isTyping });
    });

    // Handle marking message as read
    socket.on('mark-message-read', async ({ messageId, rideId }) => {
        try {
            await Chat.findByIdAndUpdate(messageId, { status: 'read' });
            // Optionally emit a message status update to the sender
            // io.to(`chat-${rideId}`).emit('message-read', { messageId });
        } catch (error) {
            console.error('Error marking message as read:', error);
        }
    });

    // Handle captain initiating chat
    socket.on('captain-initiate-chat', async ({ rideId }) => {
        try {
            if (!rideId || socket.user.type !== 'Captain') {
                throw new Error('Invalid request to initiate chat');
            }

            const ride = await rideModel.findById(rideId).populate('user');
            if (!ride) {
                throw new Error('Ride not found');
            }

            // Create an initial message from the captain
             const initialMessage = new Chat({
                rideId: rideId,
                sender: 'captain',
                senderId: socket.user.id,
                text: 'Hi, I\'m on my way!',
                status: 'sent'
            });

            await initialMessage.save();

            // Join the chat room and emit the initial message and chat initiated event
            socket.join(`chat-${rideId}`); // Captain joins their own chat room
            io.to(`chat-${rideId}`).emit('receive-message', initialMessage);
            io.to(`User-${ride.user._id}`).emit('chat-initiated', { rideId });

        } catch (error) {
            console.error('Error initiating chat:', error);
            socket.emit('message-error', { error: error.message || 'Failed to initiate chat' });
        }
    });

    // Handle ride status updates
    socket.on('ride:status', async ({ rideId, status, data }) => {
      try {
        if (!rideId || !status) {
          throw new Error('Invalid ride data');
        }

        const ride = await rideModel.findById(rideId)
          .populate('user', 'fullname phone')
          .populate('captain', 'fullname phone vehicle');

        if (!ride) {
          throw new Error('Ride not found');
        }

        // Validate status transition
        const validTransitions = {
          'requested': ['accepted', 'cancelled'],
          'accepted': ['on-the-way', 'cancelled'],
          'on-the-way': ['in-progress', 'cancelled'],
          'in-progress': ['completed', 'cancelled'],
          'completed': [],
          'cancelled': []
        };

        if (!validTransitions[ride.status].includes(status)) {
          throw new Error(`Invalid status transition from ${ride.status} to ${status}`);
        }

        // Update ride status
        ride.status = status;
        
        // Handle specific status updates
        switch (status) {
          case 'accepted':
            if (socket.user.type !== 'Captain') {
              throw new Error('Only captain can accept rides');
            }
            ride.captain = socket.user.id;
            await captainModel.findByIdAndUpdate(socket.user.id, {
              isAvailable: false,
              lastSeen: new Date()
            });
            break;

          case 'on-the-way':
            if (socket.user.type !== 'Captain') {
              throw new Error('Only captain can update ride to on-the-way');
            }
            ride.estimatedArrivalTime = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
            break;

          case 'in-progress':
            if (socket.user.type !== 'Captain') {
              throw new Error('Only captain can start rides');
            }
            if (data.otp && ride.otp !== data.otp) {
              throw new Error('Invalid OTP');
            }
            ride.actualArrivalTime = new Date();
            break;

          case 'completed':
            if (socket.user.type !== 'Captain') {
              throw new Error('Only captain can complete rides');
            }
            ride.actualEndTime = new Date();
            await captainModel.findByIdAndUpdate(ride.captain, {
              isAvailable: true,
              lastSeen: new Date()
            });
            break;

          case 'cancelled':
            ride.cancellationReason = data.reason || 'Cancelled by user';
            if (ride.captain) {
              await captainModel.findByIdAndUpdate(ride.captain, {
                isAvailable: true,
                lastSeen: new Date()
              });
            }
            break;
        }

        await ride.save();

        // Notify all parties
        io.to(`User-${ride.user._id}`).emit('ride:status:updated', {
          status,
          data: ride
        });

        if (ride.captain) {
          io.to(`Captain-${ride.captain._id}`).emit('ride:status:updated', {
            status,
            data: { rideId: ride._id, ...data }
          });
        }

      } catch (error) {
        console.error('Error handling ride status update:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Handle new ride request
    socket.on('new:ride', async (rideData) => {
      try {
        if (!rideData || !rideData.userId) {
          throw new Error('Invalid ride data');
        }

        // Find all active captains
        const captains = await captainModel.find({
          lastSeen: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
        });

        console.log(`Found ${captains.length} active captains to notify`);

        if (captains.length === 0) {
          io.to(`User-${rideData.userId}`).emit('error', {
            message: 'No drivers are currently available. Please try again later.'
          });
          return;
        }

        // Notify all active captains
        captains.forEach(captain => {
          if (captain.socketId) {
            console.log(`Notifying captain ${captain._id} about new ride request`);
            io.to(captain.socketId).emit('new-ride', rideData);
          }
        });
      } catch (error) {
        console.error('Error handling new ride request:', error);
        socket.emit('error', { message: error.message || 'Failed to notify drivers' });
      }
    });

    // Handle location updates
    socket.on('update:location', async ({ lat, lng }) => {
      if (socket.user.type === 'Captain') {
        try {
          await captainModel.findByIdAndUpdate(socket.user.id, {
            location: {
              type: 'Point',
              coordinates: [lng, lat]
            },
            lastLocationUpdate: new Date()
          });

          // Emit location update to all users in active rides with this captain
          const activeRides = await rideModel.find({
            captain: socket.user.id,
            status: { $in: ['accepted', 'on-the-way', 'in-progress'] }
          }).populate('user');

          activeRides.forEach(ride => {
            io.to(`User-${ride.user._id}`).emit('captain-location', {
              rideId: ride._id,
              lat,
              lng
            });
          });
        } catch (error) {
          console.error('Error updating captain location:', error);
          socket.emit('error', { message: 'Failed to update location' });
        }
      }
    });

    // Handle periodic last seen updates for captains
    socket.on('update:lastSeen', async () => {
      try {
        if (socket.user.type === 'Captain') {
          // Update the captain's lastSeen timestamp
          await captainModel.findByIdAndUpdate(socket.user.id, {
            lastSeen: new Date()
          });
        } else if (socket.user.type === 'User') {
          // Update the user's lastSeen timestamp
          await userModel.findByIdAndUpdate(socket.user.id, {
            lastSeen: new Date()
          });
        }
      } catch (error) {
        console.error('Error updating captain last seen:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log(`${socket.user.type} disconnected:`, socket.user.id);
      
      if (socket.user.type === 'Captain') {
        try {
          await captainModel.findByIdAndUpdate(socket.user.id, {
            socketId: null,
            isAvailable: false,
            lastSeen: new Date()
          });
        } catch (error) {
          console.error('Error handling captain disconnect:', error);
        }
      }
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

const sendMessageToSocketId = (socketId, message) => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  io.to(socketId).emit(message.event, message.data);
};

const broadcastToRoom = (roomId, event, data) => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  io.to(roomId).emit(event, data);
};

module.exports = { 
  initializeSocket, 
  getIO,
  sendMessageToSocketId,
  broadcastToRoom
};
