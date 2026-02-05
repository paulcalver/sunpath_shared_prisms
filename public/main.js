const london = { lat: 51.5074, lon: -0.1278 };

let currentElevation;
let currentAzimuth;
let timeDisplay;
let currentTime; // Shared time for both display and sun calculations

// Socket.IO variables
let socket;
let mySocketId = null;
let allUserPrisms = {}; // Structure: { socketId: [prism, prism, prism] }

// Multiple prisms variables
let myPrisms = [null, null, null]; // Array for 3 prisms
let selectedPrismIndex = null; // Which prism is selected

// Define locations array with London
const locations = [
  {
    name: 'London',
    lat: london.lat,
    lon: london.lon,
    keyNumber: 1,
    enabled: true
  }
];

// Return current time (real or overridden)
function getAnimatedTime() {
  return currentTime || new Date();
}

function getSunriseSunset(lat, lon, date) {
  const testDate = new Date(date);
  testDate.setHours(0, 0, 0, 0);

  let sunrise = null;
  let sunset = null;

  // Search through the day in 1-minute increments
  for (let minutes = 0; minutes < 1440; minutes++) {
    testDate.setHours(0, minutes, 0, 0);
    const sunPos = getSunPosition(lat, lon, testDate);

    // Found sunrise (sun crosses horizon going up)
    if (sunrise === null && sunPos.elevation > 0) {
      sunrise = new Date(testDate);
    }

    // Found sunset (sun crosses horizon going down, after sunrise)
    if (sunrise !== null && sunset === null && sunPos.elevation < 0) {
      sunset = new Date(testDate);
      sunset.setMinutes(sunset.getMinutes() - 1); // Go back to last positive elevation
      break;
    }
  }

  return { sunrise, sunset };
}


// Update the DOM time display with date, location, wall bearing, and time
function updateTimeDisplay() {
  const sunTime = getAnimatedTime();
  const hours = String(sunTime.getHours()).padStart(2, '0');
  const minutes = String(sunTime.getMinutes()).padStart(2, '0');
  const seconds = String(sunTime.getSeconds()).padStart(2, '0');

  // Format date (e.g., "Jan 14, 2026")
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = `${months[sunTime.getMonth()]} ${sunTime.getDate()}, ${sunTime.getFullYear()}`;

  // Master line
  const masterLine = `${dateStr} | GMT ${hours}:${minutes}:${seconds}`;

  // Build location lines for all enabled locations
  const enabledLocations = locations.filter(loc => loc.enabled);
  const locationLines = enabledLocations.map(location => {
    const sunPos = getSunPosition(location.lat, location.lon, sunTime);
    const elevStr = sunPos.elevation.toFixed(1);
    const azStr = sunPos.azimuth.toFixed(1);

    // Check if sun is at horizon (sunrise/sunset) - within 2 degrees of horizon
    const isAtHorizon = sunPos.elevation >= 0 && sunPos.elevation <= 2;

    // Color the line yellow if at sunrise/sunset
    if (isAtHorizon) {
      return `<span style="color: #FFD700;">[${location.keyNumber}] ${location.name} | Elevation: ${elevStr}° | Azimuth: ${azStr}°</span>`;
    } else {
      return `${location.name} | Elevation: ${elevStr}° | Azimuth: ${azStr}°`;
    }
  });

  // Combine all lines with HTML line breaks
  const displayText = [masterLine, ...locationLines].join('<br>');
  timeDisplay.html(displayText);
}


function setup() {
  createCanvas(windowWidth, windowHeight);
  angleMode(DEGREES);
  colorMode(HSB, 360, 100, 100, 100);

  // Create DOM element for time display
  timeDisplay = createDiv('00:00:00');
  timeDisplay.style('position', 'fixed');
  timeDisplay.style('bottom', '30px');
  timeDisplay.style('left', '30px');
  timeDisplay.style('color', '#464646');
  timeDisplay.style('font-family', 'monospace');
  timeDisplay.style('font-size', '12px');
  timeDisplay.style('z-index', '1000');
  timeDisplay.style('pointer-events', 'none');
  timeDisplay.style('line-height', '1.4');

  // Initialize Socket.IO
  initSocket();
}

function draw() {
  background(0);
  
  currentTime = new Date();
  currentTime.setHours(10, 0, 0);

  const sunPos = getSunPosition(london.lat, london.lon, currentTime);
  currentElevation = sunPos.elevation;
  currentAzimuth = (sunPos.azimuth - 90 + 360) % 360;

  // Check for held keys every frame
  keyHeld();

  // Draw all other users' prisms
  for (let userId in allUserPrisms) {
    for (let i = 0; i < 3; i++) {
      if (allUserPrisms[userId][i]) {
        if (currentElevation > 0) {
          allUserPrisms[userId][i].draw(currentAzimuth, currentElevation);
        } else {
          allUserPrisms[userId][i].drawOutline();
        }
      }
    }
  }

  // Draw my prisms
  for (let i = 0; i < 3; i++) {
    if (myPrisms[i]) {
      if (currentElevation > 0) {
        myPrisms[i].draw(currentAzimuth, currentElevation);
      } else {
        myPrisms[i].drawOutline();
      }
    }
  }

  updateTimeDisplay();
}

function mousePressed() {
  // Check if clicking on any existing prism
  for (let i = 0; i < 3; i++) {
    if (myPrisms[i] && myPrisms[i].containsPoint(mouseX, mouseY)) {
      // Deselect previously selected prism
      if (selectedPrismIndex !== null && myPrisms[selectedPrismIndex]) {
        myPrisms[selectedPrismIndex].isSelected = false;
      }
      // Select this prism
      selectedPrismIndex = i;
      myPrisms[i].isSelected = true;
      return;
    }
  }

  // Click on empty space - deselect all
  if (selectedPrismIndex !== null && myPrisms[selectedPrismIndex]) {
    myPrisms[selectedPrismIndex].isSelected = false;
    selectedPrismIndex = null;
  }

  // Place new prism in first empty slot
  for (let i = 0; i < 3; i++) {
    if (myPrisms[i] === null) {
      myPrisms[i] = new Prism(mouseX, mouseY, 0, mySocketId || 'temp-id', i);
      // Deselect previous
      if (selectedPrismIndex !== null && myPrisms[selectedPrismIndex]) {
        myPrisms[selectedPrismIndex].isSelected = false;
      }
      // Select new prism
      selectedPrismIndex = i;
      myPrisms[i].isSelected = true;

      // Emit to server
      emitPrismUpdate(i);
      break;
    }
  }
}

function mouseDragged() {
  if (selectedPrismIndex !== null && myPrisms[selectedPrismIndex]) {
    myPrisms[selectedPrismIndex].x = mouseX;
    myPrisms[selectedPrismIndex].y = mouseY;

    // Emit to server
    emitPrismUpdate(selectedPrismIndex);
  }
}

function keyPressed() {
  if (selectedPrismIndex !== null && myPrisms[selectedPrismIndex]) {
    if (keyCode === DELETE || keyCode === BACKSPACE) {
      emitPrismDelete(selectedPrismIndex);
      myPrisms[selectedPrismIndex] = null;
      selectedPrismIndex = null;
    }
  }
}

// Check for held keys
function keyHeld() {
  if (selectedPrismIndex !== null && myPrisms[selectedPrismIndex]) {
    let rotationChanged = false;

    if (keyIsDown(LEFT_ARROW)) {
      myPrisms[selectedPrismIndex].rotation -= 1;
      rotationChanged = true;
    }
    if (keyIsDown(RIGHT_ARROW)) {
      myPrisms[selectedPrismIndex].rotation += 1;
      rotationChanged = true;
    }

    // Emit rotation updates (throttled by frame rate)
    if (rotationChanged) {
      emitPrismUpdate(selectedPrismIndex);
    }
  }
}

function getSunPosition(lat, lon, date) {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  const time = date.getTime();
  const JD = (time / 86400000) + 2440587.5;
  const n = JD - 2451545.0;

  let L = (280.460 + 0.9856474 * n) % 360;
  let g = (357.528 + 0.9856003 * n) % 360;
  const lambda = (L + 1.915 * Math.sin(g * rad) + 0.020 * Math.sin(2 * g * rad)) % 360;
  const epsilon = 23.439 - 0.0000004 * n;

  let RA = deg * Math.atan2(Math.cos(epsilon * rad) * Math.sin(lambda * rad), Math.cos(lambda * rad));
  RA = (RA + 360) % 360;

  const delta = deg * Math.asin(Math.sin(epsilon * rad) * Math.sin(lambda * rad));

  const GMST = (280.460 + 360.9856474 * n) % 360;
  const LST = (GMST + lon) % 360;

  let H = (LST - RA + 360) % 360;
  if (H > 180) H = H - 360;

  const latRad = lat * rad;
  const HRad = H * rad;
  const deltaRad = delta * rad;

  const elevation = deg * Math.asin(
    Math.sin(latRad) * Math.sin(deltaRad) +
    Math.cos(latRad) * Math.cos(deltaRad) * Math.cos(HRad)
  );

  let azimuth = deg * Math.atan2(
    -Math.sin(HRad),
    Math.cos(latRad) * Math.tan(deltaRad) - Math.sin(latRad) * Math.cos(HRad)
  );
  azimuth = (azimuth + 360) % 360;

  return { azimuth, elevation };
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function initSocket() {
  // Connect to server (adjust URL for production)
  socket = io();

  socket.on('connect', () => {
    console.log('Connected to server:', socket.id);
    mySocketId = socket.id;
  });

  // Receive initial state of all users' prisms
  socket.on('init-state', (allUsers) => {
    console.log('Received init state:', allUsers);

    // Convert server data to Prism objects
    for (let userId in allUsers) {
      if (userId === mySocketId) continue; // Skip our own prisms

      allUserPrisms[userId] = [];
      for (let prismData of allUsers[userId].prisms) {
        if (prismData.x !== null && prismData.y !== null) {
          allUserPrisms[userId].push(
            new Prism(prismData.x, prismData.y, prismData.rotation, userId, prismData.id)
          );
        } else {
          allUserPrisms[userId].push(null);
        }
      }
      // User's prisms expired due to inactivity
      socket.on('user-expired', (userId) => {
        console.log('User prisms expired:', userId);
        if (allUserPrisms[userId]) {
          delete allUserPrisms[userId];
        }
      });
    }
  });

  // New user joined
  socket.on('user-joined', (data) => {
    console.log('User joined:', data.userId);
    allUserPrisms[data.userId] = [];
    for (let prismData of data.prisms) {
      if (prismData.x !== null && prismData.y !== null) {
        allUserPrisms[data.userId].push(
          new Prism(prismData.x, prismData.y, prismData.rotation, data.userId, prismData.id)
        );
      } else {
        allUserPrisms[data.userId].push(null);
      }
    }
  });

  // Another user's prism was updated
  socket.on('prism-updated', (data) => {
    console.log('Prism updated:', data);

    if (!allUserPrisms[data.userId]) {
      allUserPrisms[data.userId] = [null, null, null];
    }

    const prismIndex = data.prismId;

    if (data.x === null || data.y === null) {
      // Prism was deleted
      allUserPrisms[data.userId][prismIndex] = null;
    } else {
      // Prism was created or updated
      if (allUserPrisms[data.userId][prismIndex]) {
        // Update existing prism
        allUserPrisms[data.userId][prismIndex].update(data.x, data.y, data.rotation);
      } else {
        // Create new prism
        allUserPrisms[data.userId][prismIndex] =
          new Prism(data.x, data.y, data.rotation, data.userId, prismIndex);
      }
    }
  });

  // User disconnected
  socket.on('user-disconnected', (userId) => {
    console.log('User disconnected:', userId);
    // Keep their prisms visible (persistent)
  });
}

// Emit prism update to server
function emitPrismUpdate(prismIndex) {
  if (!socket || !myPrisms[prismIndex]) return;

  const prism = myPrisms[prismIndex];
  socket.emit('prism-update', {
    prismId: prismIndex,
    x: prism.x,
    y: prism.y,
    rotation: prism.rotation
  });
}

// Emit prism deletion to server
function emitPrismDelete(prismIndex) {
  if (!socket) return;

  socket.emit('prism-update', {
    prismId: prismIndex,
    x: null,
    y: null,
    rotation: 0
  });
}