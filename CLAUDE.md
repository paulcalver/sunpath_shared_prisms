# Global Prisms (Sun Path Prisms) — Master Notes

A shared virtual space where people place prisms that glow/dim with the sun's path at their geographic location. Author: Paul Calver <pcalv001@gold.ac.uk>. Repo: https://github.com/paulcalver/sunpath_shared_prisms

## Tech stack
- Node.js / Express (ESM, `"type": "module"`) serving `public/`
- Socket.IO for real-time multi-user sync
- p5.js (WEBGL) rendering; GLSL shaders (Gaussian blur, film grain) in `public/blur.frag`, `shader.vert`
- Solar position algorithms; Snell's-law refraction, 7-band spectrum (`public/prism.js`)
- JSON persistence: `prisms-data.json`, saved every 5 min and on SIGTERM

## Layout
- `server.js` — Express + Socket.IO, load/save state. Env: `PORT` (default 3000), `DATA_PATH` (dir for `prisms-data.json`, default cwd)
- `public/` — `index.html`, `main.js`, `prism.js`, `style.css`, shaders, `libraries/`
- `media/` — README screenshots
- `prisms-data.json` — local persisted state

## Run locally
```bash
npm install
npm start   # http://localhost:3000
```

## Deployments
1. **Render** (original): https://global-prisms.onrender.com/
2. **DigitalOcean Droplet** (live): https://prisms.8minutes20.studio — see Droplet section.

## Droplet
Infra details (host, SSH access, nginx/systemd setup, shared services, new-app recipe) are kept in the gitignored `CLAUDE.local.md`. This app runs there on port 8001 behind nginx at prisms.8minutes20.studio.

## Recent history (git)
- Added `//` comments throughout; added hidden "move prism" UI; added `media/` folder; updated prism light alpha.

## Notes / conventions
- Match existing style: plain ESM JS, `//` comment headers per file.
- Secrets/env files are never committed; infra identifiers live in `CLAUDE.local.md` (gitignored).
