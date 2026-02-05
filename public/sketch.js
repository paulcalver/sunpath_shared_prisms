const london = { lat: 51.5074, lon: -0.1278 };

let currentElevation;
let currentAzimuth;
let timeDisplay;

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

// Return current real-time
function getAnimatedTime() {
  return new Date();
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
  noStroke();
  colorMode(HSB, 360, 100, 100, 100);

  // Create DOM element for time display
  timeDisplay = createDiv('00:00:00');
  timeDisplay.style('position', 'fixed');
  timeDisplay.style('bottom', '30px'); // Anchor to bottom
  timeDisplay.style('left', '30px');
  timeDisplay.style('color', '#464646');
  timeDisplay.style('font-family', 'monospace');
  timeDisplay.style('font-size', '12px');
  timeDisplay.style('z-index', '1000');
  timeDisplay.style('pointer-events', 'none'); // Don't interfere with mouse events
  timeDisplay.style('line-height', '1.4'); // Add spacing between lines

}


function draw() {
  background(0);

  const now = new Date();
  //now.setHours(12, 0, 0); // 12:00 noon

  // Calculate current sun position for London
  const sunPos = getSunPosition(london.lat, london.lon, now);
  currentElevation = sunPos.elevation;
  currentAzimuth = sunPos.azimuth;

  // Update the DOM display
  updateTimeDisplay();
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