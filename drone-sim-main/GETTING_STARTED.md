# Getting Started with CesiumSim

CesiumSim is a high-fidelity first-person drone simulator built with CesiumJS and Three.js. It features realistic drone physics and global 3D tiles from Google.

## 🚀 Quick Start

### 1. Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### 2. Installation
```bash
npm install
```

### 3. Setup Environment
Create a `.env` file in the root directory (based on `.env.example` if available, or manually):
```env
VITE_CESIUM_TOKEN=your_cesium_token
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

### 4. Run the Simulator
```bash
npm run dev
```
Then open `http://localhost:5173` (or the port shown in your terminal).

---

## 🏗️ Project Structure

- `src/`: Core TypeScript source code.
  - `main.ts`: Entry point.
  - `simulator/`: Core simulator logic.
    - `simulator-app.ts`: Main simulator loop and initialization.
    - `config.ts`: Physics constants and starting locations.
    - `hud.ts`: Heads-up display management.
    - `playgrounds/`: Pre-defined challenge courses (Slalom, Maze, etc.).
  - `overlay/`: Geospatial rendering overlay using Three.js.
- `public/`: Static assets (textures, 3D models).
- `index.html`: Main HTML entry with UI layout.
- `styles.css`: Visual styling for the HUD and panels.

---

## 🎮 Controls

### Flight Controls
- `W` / `S`: Ascend / Descend
- `↑` / `↓`: Forward / Backward
- `←` / `→`: Yaw (Turn Left / Right)
- `A` / `D`: Strafe Left / Right
- `Space`: Rise (Inertial)
- `Shift`: Descend (Inertial)
- `Ctrl`: Boost

### System Controls
- `1` / `2` / `3` / `4`: Change Speed Tier (1x, 3x, 5x, 10x)
- `C`: Toggle FPV / Chase Camera
- `R`: Reset to Spawn Point

---

## 🛠️ Tech Stack

- **CesiumJS**: Global 3D mapping and terrain engine.
- **Three.js**: High-fidelity atmospheric rendering and volumetric clouds (via `@takram/three-atmosphere`).
- **Vite**: Ultra-fast build tool and dev server.
- **TypeScript**: Type-safe development.
- **Google Photorealistic 3D Tiles**: High-resolution world geometry.

---

## 🌟 Key Features

### High-Fidelity Physics
Realistic drone flight model with horizontal/vertical drag, acceleration, and gravity. Includes collision detection for both terrain and 3D buildings.

### Geospatial Overlay
A custom Three.js layer synchronized with the Cesium camera, providing physically-based atmospheric scattering, volumetric clouds, and cinematic lighting.

### Playgrounds
Switch between the real world and custom-built challenge courses with waypoints and score tracking.
