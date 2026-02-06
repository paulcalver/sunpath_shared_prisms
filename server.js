import express from "express";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
import path from "path";

const app = express();
const server = http.createServer(app);
const io = new Server(server);


app.use(express.static('public'));

// Store all users' prisms with timestamps and locations
let allUsers = {};

const EXPIRY_TIME = 14 * 24 * 60 * 60 * 1000; // 14 days
const CLEANUP_INTERVAL = 60 * 1000; // 60 seconds
const SAVE_INTERVAL = 5 * 60 * 1000; // Save every 5 minutes
const DATA_FILE = process.env.DATA_PATH
  ? path.join(process.env.DATA_PATH, 'prisms-data.json')
  : path.join(process.cwd(), 'prisms-data.json');

console.log('Data file path:', DATA_FILE);
console.log('DATA_PATH env var:', process.env.DATA_PATH || 'not set');

// Ensure data directory exists
if (process.env.DATA_PATH) {
  try {
    if (!fs.existsSync(process.env.DATA_PATH)) {
      fs.mkdirSync(process.env.DATA_PATH, { recursive: true });
      console.log('Created data directory:', process.env.DATA_PATH);
    }
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

// Load data from file on startup
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      console.log('Loading data from:', DATA_FILE);
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      const loaded = JSON.parse(data);
      console.log(`✓ Loaded ${Object.keys(loaded).length} users from persistent storage`);
      return loaded;
    } else {
      console.log('No existing data file found at:', DATA_FILE);
    }
  } catch (error) {
    console.error('✗ Error loading data:', error.message);
  }
  return {};
}

// Save data to file
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(allUsers, null, 2), 'utf8');
    console.log(`✓ Saved ${Object.keys(allUsers).length} users to: ${DATA_FILE}`);
  } catch (error) {
    console.error('✗ Error saving data:', error.message);
    console.error('  Make sure the directory exists and has write permissions');
  }
}

// Load existing data on startup
allUsers = loadData();

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
  
  // Save after cleanup if any users were removed
  if (usersToRemove.length > 0) {
    saveData();
  }
}

setInterval(cleanupExpiredPrisms, CLEANUP_INTERVAL);
setInterval(saveData, SAVE_INTERVAL);

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
    // Note: We keep the user data for 7 days even after disconnect
  });
});

// Save data on graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, saving data before shutdown...');
  saveData();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, saving data before shutdown...');
  saveData();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Prisms will expire after ${EXPIRY_TIME / 1000 / 60 / 60 / 24} days of inactivity`);
  console.log(`Data will be saved every ${SAVE_INTERVAL / 1000 / 60} minutes`);
});