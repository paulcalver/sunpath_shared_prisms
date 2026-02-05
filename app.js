const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from public directory
app.use(express.static('public'));

// Store all users' prisms
// Structure: { socketId: { prisms: [{id, x, y, rotation}, ...] } }
const allUsers = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Initialize this user with empty prisms
  allUsers[socket.id] = {
    prisms: [
      { id: 0, x: null, y: null, rotation: 0 },
      { id: 1, x: null, y: null, rotation: 0 },
      { id: 2, x: null, y: null, rotation: 0 }
    ]
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

  // Handle disconnect - keep prisms persistent
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Prisms remain in allUsers object
    // Broadcast that this user disconnected (optional - for UI feedback)
    socket.broadcast.emit('user-disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});