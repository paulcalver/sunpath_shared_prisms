import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server);


app.use(express.static('public'));

// Store all users' prisms with timestamps and locations
const allUsers = {};

const EXPIRY_TIME = 2 * 24 * 60 * 60 * 1000; // 48 hours
const CLEANUP_INTERVAL = 60 * 1000; // 60 seconds

function cleanupExpiredPrisms() {
  const now = Date.now();
  let usersToRemove = [];
  
  for (let userId in allUsers) {
    if (now - allUsers[userId].lastUpdate > EXPIRY_TIME) {
      console.log('Expiring prisms for user:', userId);
      usersToRemove.push(userId);
    }
  }
  
  for (let userId of usersToRemove) {
    delete allUsers[userId];
    io.emit('user-expired', userId);
  }
}

setInterval(cleanupExpiredPrisms, CLEANUP_INTERVAL);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Initialize this user with 8 prism slots
  const MAX_PRISMS = 8;
  const emptyPrisms = [];
  for (let i = 0; i < MAX_PRISMS; i++) {
    emptyPrisms.push({
      id: i,
      x: null,
      y: null,
      rotation: 0,
      cityName: '',
      cityLat: 0,
      cityLon: 0,
      userName: ''
    });
  }

  allUsers[socket.id] = {
    prisms: emptyPrisms,
    locationIndex: 0, // Default to first location
    lastUpdate: Date.now()
  };

  // Send all existing prisms to new user
  socket.emit('init-state', allUsers);

  // Broadcast new user to others
  socket.broadcast.emit('user-joined', {
    userId: socket.id,
    prisms: allUsers[socket.id].prisms,
    locationIndex: allUsers[socket.id].locationIndex
  });

  // Handle location updates
  socket.on('location-update', (data) => {
    if (allUsers[socket.id]) {
      allUsers[socket.id].locationIndex = data.locationIndex;
      allUsers[socket.id].lastUpdate = Date.now();
      
      // Broadcast location change to all other users
      socket.broadcast.emit('location-updated', {
        userId: socket.id,
        locationIndex: data.locationIndex
      });
    }
  });

  // Handle prism updates
  socket.on('prism-update', (data) => {
    if (allUsers[socket.id]) {
      const prismIndex = data.prismId;
      const MAX_PRISMS = 8;

      if (prismIndex >= 0 && prismIndex < MAX_PRISMS) {
        allUsers[socket.id].prisms[prismIndex] = {
          id: prismIndex,
          x: data.x,
          y: data.y,
          rotation: data.rotation,
          cityName: data.cityName || '',
          cityLat: data.cityLat || 0,
          cityLon: data.cityLon || 0,
          userName: data.userName || ''
        };

        allUsers[socket.id].lastUpdate = Date.now();

        socket.broadcast.emit('prism-updated', {
          userId: socket.id,
          prismId: prismIndex,
          x: data.x,
          y: data.y,
          rotation: data.rotation,
          cityName: data.cityName || '',
          cityLat: data.cityLat || 0,
          cityLon: data.cityLon || 0,
          userName: data.userName || '',
          locationIndex: allUsers[socket.id].locationIndex
        });
      }
    }
  });

  socket.on('disconnect', () => {
    // console.log('User disconnected:', socket.id);
    socket.broadcast.emit('user-disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  // console.log(`Server running on port ${PORT}`);
  console.log(`Prisms will expire after ${EXPIRY_TIME / 1000 / 60} minutes of inactivity`);
});