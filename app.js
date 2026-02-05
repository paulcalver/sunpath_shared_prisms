const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from public directory
app.use(express.static('public'));

// Store all users' prisms with timestamps
// Structure: { socketId: { prisms: [...], lastUpdate: timestamp } }
const allUsers = {};

// Auto-expire interval: 5 minutes in milliseconds

//const EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes
const EXPIRY_TIME = 10 * 1000; // 10 seconds for testing purposes
const CLEANUP_INTERVAL = 10 * 1000; // Check every 30 seconds

// Cleanup function to remove expired prisms
function cleanupExpiredPrisms() {
  const now = Date.now();
  let usersToRemove = [];
  
  for (let userId in allUsers) {
    if (now - allUsers[userId].lastUpdate > EXPIRY_TIME) {
      console.log('Expiring prisms for user:', userId);
      usersToRemove.push(userId);
    }
  }
  
  // Remove expired users
  for (let userId of usersToRemove) {
    delete allUsers[userId];
    // Broadcast removal to all clients
    io.emit('user-expired', userId);
  }
}

// Start cleanup interval
setInterval(cleanupExpiredPrisms, CLEANUP_INTERVAL);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Initialize this user with empty prisms and current timestamp
  allUsers[socket.id] = {
    prisms: [
      { id: 0, x: null, y: null, rotation: 0 },
      { id: 1, x: null, y: null, rotation: 0 },
      { id: 2, x: null, y: null, rotation: 0 }
    ],
    lastUpdate: Date.now()
  };

  // Send the new user all existing prisms
  socket.emit('init-state', allUsers);

  // Broadcast to all other users that a new user joined
  socket.broadcast.emit('user-joined', {
    userId: socket.id,
    prisms: allUsers[socket.id].prisms
  });

  // Handle prism updates from this user
  socket.on('prism-update', (data) => {
    // data = { prismId, x, y, rotation }
    if (allUsers[socket.id]) {
      const prismIndex = data.prismId;
      if (prismIndex >= 0 && prismIndex < 3) {
        allUsers[socket.id].prisms[prismIndex] = {
          id: prismIndex,
          x: data.x,
          y: data.y,
          rotation: data.rotation
        };
        
        // Update timestamp to keep prisms alive
        allUsers[socket.id].lastUpdate = Date.now();

        // Broadcast this update to all other users
        socket.broadcast.emit('prism-updated', {
          userId: socket.id,
          prismId: prismIndex,
          x: data.x,
          y: data.y,
          rotation: data.rotation
        });
      }
    }
  });

  // Handle disconnect - keep prisms but they'll expire after 5 mins
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Prisms remain in allUsers but lastUpdate won't be updated
    // Will be cleaned up after EXPIRY_TIME
    socket.broadcast.emit('user-disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Prisms will expire after ${EXPIRY_TIME / 1000 / 60} minutes of inactivity`);
});