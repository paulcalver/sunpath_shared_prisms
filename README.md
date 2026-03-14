# Global Prisms

A shared virtual space where people across the world place their own prisms, each responding to the sun's path relative to its geographic location. As the Earth rotates, prisms glow and dim with their local solar cycles, creating a living constellation of coloured beacons that charts our planet's movement through space.

Each prism maintains its own local time while existing in a communal field where distance dissolves. When your prism catches the morning light, others halfway around the world dim into twilight. The result is a constantly shifting pattern that makes the Earth's rotation visible and immediate, a collective experience of astronomical time that connects us through our shared orbital dance.

Live communal demo here - https://global-prisms.onrender.com/

![Global_Prisms_03](https://github.com/user-attachments/assets/04fca973-557c-47f2-b453-12631336fd7e)



## Tech Stack

- **Node.js / Express** — HTTP server and static file serving
- **Socket.IO** — real-time sync across all connected clients
- **p5.js (WEBGL)** — 3D canvas rendering
- **GLSL shaders** — Gaussian blur and film grain post-processing
- **Astronomical algorithms** — accurate solar position for any location and time
- **Snell's law refraction** — 7-band visible spectrum, per-wavelength refractive indices
- **JSON persistence** — prism state saved every 5 minutes
- **Render** — live deployment

## Running Locally

```bash
npm install
npm start   # http://localhost:3000
```

## Author

**Paul Calver** — pcalv001@gold.ac.uk
