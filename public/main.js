// Configuration
const MAX_PRISMS = 8; // Maximum number of prisms per user

let currentElevation;
let currentAzimuth;
let timeDisplay;
let timeSpeed = 3600; // 1 = real time, 60 = 1 minute per second, etc.
let timeOffset = 0; // accumulated time offset in milliseconds

// Socket.IO variables
let socket;
let mySocketId = null;
let allUserPrisms = {}; // Structure: { socketId: { prisms: [...], locationIndex: number } }

// Multiple prisms variables
let myPrisms = Array(MAX_PRISMS).fill(null); // Array for prisms
let selectedPrismIndex = null; // Which prism is selected

// My chosen location
let myLocation = 0; // Default to first location (London)

// Throttle for rotation updates
let lastRotationEmit = 0;
const ROTATION_EMIT_INTERVAL = 50; // milliseconds (20 updates per second)

// Modal dialog for creating prisms
let prismModal = null;
let pendingPrismPosition = null; // {x, y} for where to place the prism
let citySearchResults = [];
let selectedCity = null;
let modalJustClosed = false; // Flag to prevent modal from reopening immediately

// Define locations array
const locations = [
  { id: 'london', name: 'London, UK', lat: 51.5074, lon: -0.1278, enabled: true, keyNumber: 1 },
  { id: 'marrakesh', name: 'Marrakesh, Morocco', lat: 31.6295, lon: -7.9811, enabled: true, keyNumber: 2 },
  { id: 'newyork', name: 'New York', lat: 40.7128, lon: -74.0060, enabled: true, keyNumber: 3 },
  { id: 'lisbon', name: 'Lisbon', lat: 38.7223, lon: -9.1393, enabled: true, keyNumber: 4 },
  { id: 'cairo', name: 'Cairo', lat: 30.0444, lon: 31.2357, enabled: true, keyNumber: 5 },
  { id: 'dubai', name: 'Dubai', lat: 25.2048, lon: 55.2708, enabled: true, keyNumber: 6 },
  { id: 'delhi', name: 'Delhi', lat: 28.6139, lon: 77.2090, enabled: true, keyNumber: 7 },
  { id: 'dhaka', name: 'Dhaka', lat: 23.8103, lon: 90.4125, enabled: true, keyNumber: 8 },
  { id: 'hanoi', name: 'Hanoi', lat: 21.0285, lon: 105.8542, enabled: true, keyNumber: 9 }
];

// Return current animated time
function getAnimatedTime() {
  const now = new Date();
  return new Date(now.getTime() + timeOffset);
}

// Update time offset based on speed
function updateTime() {
  if (timeSpeed !== 1) {
    // Add (timeSpeed - 1) seconds worth of time per frame
    // At 60fps, each frame is ~16.67ms
    timeOffset += (timeSpeed - 1) * (1000 / 60);
  }
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
      sunset.setMinutes(sunset.getMinutes() - 1);
      break;
    }
  }

  return { sunrise, sunset };
}

// Update the DOM time display
function updateTimeDisplay() {
  const sunTime = getAnimatedTime();
  const hours = String(sunTime.getHours()).padStart(2, '0');
  const minutes = String(sunTime.getMinutes()).padStart(2, '0');
  const seconds = String(sunTime.getSeconds()).padStart(2, '0');

  // Format date
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = `${months[sunTime.getMonth()]} ${sunTime.getDate()}, ${sunTime.getFullYear()}`;

  const displayText = `${dateStr} | GMT ${hours}:${minutes}:${seconds}`;
  timeDisplay.html(displayText);
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  angleMode(DEGREES);
  colorMode(HSB, 360, 100, 100, 100);

  // Create DOM element for time display
  timeDisplay = createDiv('00:00:00');
  timeDisplay.style('position', 'fixed');
  timeDisplay.style('bottom', '35px');
  timeDisplay.style('left', '30px');
  timeDisplay.style('color', '#464646');
  timeDisplay.style('font-family', 'monospace');
  timeDisplay.style('font-size', '12px');
  timeDisplay.style('z-index', '1000');
  timeDisplay.style('pointer-events', 'none');
  timeDisplay.style('line-height', '1.4');

  // Create time and location controls
  createTimeControls();

  // Create prism creation modal
  createPrismModal();

  // Initialize Socket.IO
  initSocket();
}

function draw() {
  background(0);

  updateTime();
  const now = getAnimatedTime();

  // Check for held keys every frame
  //keyHeld();

  // Draw all other users' prisms with EACH prism's city sun position
  for (let userId in allUserPrisms) {
    for (let i = 0; i < MAX_PRISMS; i++) {
      if (allUserPrisms[userId].prisms[i]) {
        const prism = allUserPrisms[userId].prisms[i];

        // Use prism's own city coordinates for sun position
        if (prism.cityLat && prism.cityLon) {
          const sunPos = getSunPosition(prism.cityLat, prism.cityLon, now);
          const elevation = sunPos.elevation;
          const azimuth = (sunPos.azimuth - 90 + 360) % 360;

          if (elevation > 0) {
            prism.draw(azimuth, elevation);
          } else {
            prism.drawOutline(mySocketId);
          }
        } else {
          // No city set, just draw outline
          prism.drawOutline(mySocketId);
        }

        prism.drawLabel();
      }
    }
  }

  // Draw my prisms with EACH prism's city sun position
  for (let i = 0; i < MAX_PRISMS; i++) {
    if (myPrisms[i]) {
      const prism = myPrisms[i];

      // Use prism's own city coordinates for sun position
      if (prism.cityLat && prism.cityLon) {
        const sunPos = getSunPosition(prism.cityLat, prism.cityLon, now);
        currentElevation = sunPos.elevation;
        currentAzimuth = (sunPos.azimuth - 90 + 360) % 360;

        if (currentElevation > 0) {
          prism.draw(currentAzimuth, currentElevation);
        } else {
          prism.drawOutline(mySocketId);
        }
      } else {
        // No city set, just draw outline
        prism.drawOutline(mySocketId);
      }

      prism.drawLabel();
    }
  }

  updateTimeDisplay();
}

function mousePressed() {
  // Ignore clicks if modal was just closed
  if (modalJustClosed) {
    return;
  }

  // Ignore clicks if modal is open
  if (prismModal && prismModal.style('display') === 'flex') {
    return;
  }

  // Ignore clicks in UI area (bottom-left corner)
  if (mouseY > height - 60 && mouseX < 400) {
    return;
  }

  // Check if clicking on any existing prism
  for (let i = 0; i < MAX_PRISMS; i++) {
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

  // Show modal to create new prism
  showPrismModal(mouseX, mouseY);
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

function createPrismModal() {
  // Modal overlay
  prismModal = createDiv('');
  prismModal.style('position', 'fixed');
  prismModal.style('top', '0');
  prismModal.style('left', '0');
  prismModal.style('width', '100%');
  prismModal.style('height', '100%');
  prismModal.style('background', 'rgba(0, 0, 0, 0.7)');
  prismModal.style('display', 'none');
  prismModal.style('z-index', '2000');
  prismModal.style('align-items', 'center');
  prismModal.style('justify-content', 'center');

  // Modal content box
  const modalContent = createDiv('');
  modalContent.parent(prismModal);
  modalContent.style('background', '#222');
  modalContent.style('padding', '30px');
  modalContent.style('border-radius', '8px');
  modalContent.style('width', '400px');
  modalContent.style('color', '#fff');
  modalContent.style('font-family', 'monospace');

  // Title
  const title = createDiv('Create New Prism');
  title.parent(modalContent);
  title.style('font-size', '18px');
  title.style('font-weight', 'bold');
  title.style('margin-bottom', '20px');

  // Name input
  const nameLabel = createDiv('Your Name:');
  nameLabel.parent(modalContent);
  nameLabel.style('margin-bottom', '5px');
  nameLabel.style('font-size', '12px');

  const nameInput = createInput('');
  nameInput.parent(modalContent);
  nameInput.id('prism-name-input');
  nameInput.style('width', '100%');
  nameInput.style('padding', '8px');
  nameInput.style('margin-bottom', '15px');
  nameInput.style('background', '#333');
  nameInput.style('color', '#fff');
  nameInput.style('border', '1px solid #555');
  nameInput.style('border-radius', '4px');
  nameInput.style('font-family', 'monospace');
  nameInput.style('font-size', '14px');
  nameInput.attribute('placeholder', 'Enter your name');

  // City search input
  const cityLabel = createDiv('Search City:');
  cityLabel.parent(modalContent);
  cityLabel.style('margin-bottom', '5px');
  cityLabel.style('font-size', '12px');

  const cityInput = createInput('');
  cityInput.parent(modalContent);
  cityInput.id('prism-city-input');
  cityInput.style('width', '100%');
  cityInput.style('padding', '8px');
  cityInput.style('margin-bottom', '10px');
  cityInput.style('background', '#333');
  cityInput.style('color', '#fff');
  cityInput.style('border', '1px solid #555');
  cityInput.style('border-radius', '4px');
  cityInput.style('font-family', 'monospace');
  cityInput.style('font-size', '14px');
  cityInput.attribute('placeholder', 'Type to search cities...');

  // City search results container
  const resultsContainer = createDiv('');
  resultsContainer.parent(modalContent);
  resultsContainer.id('city-search-results');
  resultsContainer.style('max-height', '200px');
  resultsContainer.style('overflow-y', 'auto');
  resultsContainer.style('margin-bottom', '15px');
  resultsContainer.style('background', '#1a1a1a');
  resultsContainer.style('border', '1px solid #444');
  resultsContainer.style('border-radius', '4px');
  resultsContainer.style('display', 'none');

  // Selected city display
  const selectedCityDiv = createDiv('');
  selectedCityDiv.parent(modalContent);
  selectedCityDiv.id('selected-city');
  selectedCityDiv.style('margin-bottom', '20px');
  selectedCityDiv.style('padding', '8px');
  selectedCityDiv.style('background', '#2a4a2a');
  selectedCityDiv.style('border-radius', '4px');
  selectedCityDiv.style('font-size', '12px');
  selectedCityDiv.style('display', 'none');

  // Buttons container
  const buttonsDiv = createDiv('');
  buttonsDiv.parent(modalContent);
  buttonsDiv.style('display', 'flex');
  buttonsDiv.style('gap', '10px');
  buttonsDiv.style('justify-content', 'flex-end');

  // Cancel button
  const cancelBtn = createButton('Cancel');
  cancelBtn.parent(buttonsDiv);
  cancelBtn.style('padding', '8px 16px');
  cancelBtn.style('background', '#555');
  cancelBtn.style('color', '#fff');
  cancelBtn.style('border', 'none');
  cancelBtn.style('border-radius', '4px');
  cancelBtn.style('cursor', 'pointer');
  cancelBtn.style('font-family', 'monospace');
  cancelBtn.mousePressed(() => {
    hidePrismModal();
    return false;
  });

  // Create button
  const createBtn = createButton('Create Prism');
  createBtn.parent(buttonsDiv);
  createBtn.id('create-prism-btn');
  createBtn.style('padding', '8px 16px');
  createBtn.style('background', '#4a7c4a');
  createBtn.style('color', '#fff');
  createBtn.style('border', 'none');
  createBtn.style('border-radius', '4px');
  createBtn.style('cursor', 'pointer');
  createBtn.style('font-family', 'monospace');
  createBtn.mousePressed(() => {
    createPrismFromModal();
    return false;
  });

  // Add city search functionality
  let searchTimeout;
  cityInput.input(() => {
    clearTimeout(searchTimeout);
    const query = cityInput.value();

    if (query.length < 2) {
      resultsContainer.style('display', 'none');
      return;
    }

    searchTimeout = setTimeout(() => {
      searchCities(query, resultsContainer);
    }, 300);
  });
}

function searchCities(query, resultsContainer) {
  // Use Nominatim API
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;

  fetch(url)
    .then(response => response.json())
    .then(data => {
      resultsContainer.html('');

      if (data.length === 0) {
        resultsContainer.html('<div style="padding: 10px; color: #888;">No cities found</div>');
        resultsContainer.style('display', 'block');
        return;
      }

      citySearchResults = data;
      resultsContainer.style('display', 'block');

      data.forEach((city, index) => {
        const cityDiv = createDiv(city.display_name);
        cityDiv.parent(resultsContainer);
        cityDiv.style('padding', '8px');
        cityDiv.style('cursor', 'pointer');
        cityDiv.style('border-bottom', '1px solid #333');
        cityDiv.style('font-size', '12px');

        cityDiv.mouseOver(() => {
          cityDiv.style('background', '#333');
        });

        cityDiv.mouseOut(() => {
          cityDiv.style('background', 'transparent');
        });

        cityDiv.mousePressed(() => {
          selectCity(city);
          return false;
        });
      });
    })
    .catch(err => {
      console.error('City search error:', err);
    });
}

function selectCity(city) {
  selectedCity = city;
  const selectedCityDiv = select('#selected-city');
  selectedCityDiv.html(`Selected: ${city.display_name}`);
  selectedCityDiv.style('display', 'block');

  const resultsContainer = select('#city-search-results');
  resultsContainer.style('display', 'none');
}

function showPrismModal(x, y) {
  pendingPrismPosition = { x, y };
  prismModal.style('display', 'flex');

  // Reset form
  select('#prism-name-input').value('');
  select('#prism-city-input').value('');
  select('#city-search-results').style('display', 'none');
  select('#selected-city').style('display', 'none');
  selectedCity = null;

  // Focus name input
  setTimeout(() => {
    select('#prism-name-input').elt.focus();
  }, 100);
}

function hidePrismModal() {
  prismModal.style('display', 'none');
  pendingPrismPosition = null;
  selectedCity = null;

  // Set flag to prevent modal from reopening immediately
  modalJustClosed = true;
  setTimeout(() => {
    modalJustClosed = false;
  }, 100);
}

function createPrismFromModal() {
  const name = select('#prism-name-input').value().trim();

  if (!name) {
    alert('Please enter your name');
    return;
  }

  if (!selectedCity) {
    alert('Please select a city');
    return;
  }

  // Find first empty prism slot
  for (let i = 0; i < MAX_PRISMS; i++) {
    if (myPrisms[i] === null) {
      // Create prism with city and name data
      myPrisms[i] = new Prism(
        pendingPrismPosition.x,
        pendingPrismPosition.y,
        -90,
        mySocketId || 'temp-id',
        i
      );

      // Add custom properties for city and name
      myPrisms[i].cityName = selectedCity.display_name.split(',')[0]; // Just city name
      myPrisms[i].cityLat = parseFloat(selectedCity.lat);
      myPrisms[i].cityLon = parseFloat(selectedCity.lon);
      myPrisms[i].userName = name;

      // Select the new prism
      if (selectedPrismIndex !== null && myPrisms[selectedPrismIndex]) {
        myPrisms[selectedPrismIndex].isSelected = false;
      }
      selectedPrismIndex = i;
      myPrisms[i].isSelected = true;

      // Emit to server
      emitPrismUpdate(i);
      break;
    }
  }

  hidePrismModal();
}

function createTimeControls() {
  // Container for controls - horizontal layout at bottom
  const controlsDiv = createDiv('');
  controlsDiv.style('position', 'fixed');
  controlsDiv.style('bottom', '5px');
  controlsDiv.style('left', '30px');
  controlsDiv.style('z-index', '1000');
  controlsDiv.style('display', 'flex');
  controlsDiv.style('align-items', 'center');
  controlsDiv.style('gap', '8px');
  controlsDiv.style('color', '#464646');
  controlsDiv.style('font-family', 'monospace');
  controlsDiv.style('font-size', '12px');

  // Speed preset buttons
  const speeds = [
    { label: '1x', value: 1 },
    { label: '300x', value: 300 },
    { label: '3600x', value: 3600 }
  ];

  const speedButtons = [];
  speeds.forEach((speed) => {
    const btn = createButton(speed.label);
    btn.parent(controlsDiv);
    btn.style('padding', '3px 12px');
    btn.style('background', speed.value === timeSpeed ? '#8b8b00' : '#333');
    btn.style('color', '#fff');
    btn.style('border', 'none');
    btn.style('border-radius', '3px');
    btn.style('cursor', 'pointer');
    btn.style('font-family', 'monospace');
    btn.style('font-size', '11px');

    btn.mousePressed(() => {
      timeSpeed = speed.value;
      // Update all button styles
      speedButtons.forEach((button, i) => {
        button.style('background', speeds[i].value === timeSpeed ? '#8b8b00' : '#333');
      });
      return false; // Prevent event propagation to canvas
    });

    speedButtons.push(btn);
  });

  // Reset button
  const resetBtn = createButton('Reset to Now');
  resetBtn.parent(controlsDiv);
  resetBtn.style('padding', '3px 12px');
  resetBtn.style('background', '#333');
  resetBtn.style('color', '#fff');
  resetBtn.style('border', 'none');
  resetBtn.style('border-radius', '3px');
  resetBtn.style('cursor', 'pointer');
  resetBtn.style('font-family', 'monospace');
  resetBtn.style('font-size', '11px');

  resetBtn.mousePressed(() => {
    timeOffset = 0;
    timeSpeed = 1;
    // Update button styles to reflect 1x speed
    speedButtons.forEach((button, i) => {
      button.style('background', speeds[i].value === timeSpeed ? '#8b8b00' : '#333');
    });
    return false; // Prevent event propagation to canvas
  });

  // Create New Prism button
  const newPrismBtn = createButton('Create New Prism');
  newPrismBtn.parent(controlsDiv);
  newPrismBtn.style('padding', '3px 12px');
  newPrismBtn.style('background', '#4a7c4a');
  newPrismBtn.style('color', '#fff');
  newPrismBtn.style('border', 'none');
  newPrismBtn.style('border-radius', '3px');
  newPrismBtn.style('cursor', 'pointer');
  newPrismBtn.style('font-family', 'monospace');
  newPrismBtn.style('font-size', '11px');

  newPrismBtn.mousePressed(() => {
    // Open modal at center of screen
    showPrismModal(width / 2, height / 2);
    return false;
  });
}

function initSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('Connected to server:', socket.id);
    mySocketId = socket.id;
    
    // Send initial location to server
    socket.emit('location-update', { locationIndex: myLocation });
  });

  // Receive initial state of all users' prisms
  socket.on('init-state', (allUsers) => {
    console.log('Received init state:', allUsers);
    
    // Convert server data to Prism objects
    for (let userId in allUsers) {
      if (userId === mySocketId) continue; // Skip our own prisms
      
      allUserPrisms[userId] = {
        prisms: [],
        locationIndex: allUsers[userId].locationIndex || 0
      };
      
      for (let prismData of allUsers[userId].prisms) {
        if (prismData.x !== null && prismData.y !== null) {
          const prism = new Prism(prismData.x, prismData.y, prismData.rotation, userId, prismData.id);
          prism.cityName = prismData.cityName || '';
          prism.cityLat = prismData.cityLat || 0;
          prism.cityLon = prismData.cityLon || 0;
          prism.userName = prismData.userName || '';
          allUserPrisms[userId].prisms.push(prism);
        } else {
          allUserPrisms[userId].prisms.push(null);
        }
      }
    }
  });

  // New user joined
  socket.on('user-joined', (data) => {
    console.log('User joined:', data.userId);
    allUserPrisms[data.userId] = {
      prisms: [],
      locationIndex: data.locationIndex || 0
    };
    
    for (let prismData of data.prisms) {
      if (prismData.x !== null && prismData.y !== null) {
        const prism = new Prism(prismData.x, prismData.y, prismData.rotation, data.userId, prismData.id);
        prism.cityName = prismData.cityName || '';
        prism.cityLat = prismData.cityLat || 0;
        prism.cityLon = prismData.cityLon || 0;
        prism.userName = prismData.userName || '';
        allUserPrisms[data.userId].prisms.push(prism);
      } else {
        allUserPrisms[data.userId].prisms.push(null);
      }
    }
  });

  // Another user's prism was updated
  socket.on('prism-updated', (data) => {
    console.log('Prism updated:', data);
    
    if (!allUserPrisms[data.userId]) {
      allUserPrisms[data.userId] = {
        prisms: Array(MAX_PRISMS).fill(null),
        locationIndex: data.locationIndex || 0
      };
    }

    const prismIndex = data.prismId;
    
    if (data.x === null || data.y === null) {
      // Prism was deleted
      allUserPrisms[data.userId].prisms[prismIndex] = null;
    } else {
      // Prism was created or updated
      if (allUserPrisms[data.userId].prisms[prismIndex]) {
        // Update existing prism
        allUserPrisms[data.userId].prisms[prismIndex].x = data.x;
        allUserPrisms[data.userId].prisms[prismIndex].y = data.y;
        allUserPrisms[data.userId].prisms[prismIndex].rotation = data.rotation;
        allUserPrisms[data.userId].prisms[prismIndex].cityName = data.cityName || '';
        allUserPrisms[data.userId].prisms[prismIndex].cityLat = data.cityLat || 0;
        allUserPrisms[data.userId].prisms[prismIndex].cityLon = data.cityLon || 0;
        allUserPrisms[data.userId].prisms[prismIndex].userName = data.userName || '';
      } else {
        // Create new prism
        const prism = new Prism(data.x, data.y, data.rotation, data.userId, prismIndex);
        prism.cityName = data.cityName || '';
        prism.cityLat = data.cityLat || 0;
        prism.cityLon = data.cityLon || 0;
        prism.userName = data.userName || '';
        allUserPrisms[data.userId].prisms[prismIndex] = prism;
      }
    }
  });

  // User's location changed
  socket.on('location-updated', (data) => {
    console.log('Location updated for user:', data.userId, 'to index:', data.locationIndex);
    if (allUserPrisms[data.userId]) {
      allUserPrisms[data.userId].locationIndex = data.locationIndex;
    }
  });

  // User's prisms expired due to inactivity
  socket.on('user-expired', (userId) => {
    console.log('User prisms expired:', userId);
    if (allUserPrisms[userId]) {
      delete allUserPrisms[userId];
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
    rotation: prism.rotation,
    cityName: prism.cityName || '',
    cityLat: prism.cityLat || 0,
    cityLon: prism.cityLon || 0,
    userName: prism.userName || '',
    locationIndex: myLocation
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