// ### What this file does
// Simulates realistic wind that affects the drone. Wind has three layers:
// 1. Mean wind — a steady breeze in one direction
// 2. Turbulence — random fluctuations that vary by location (using noise math)
// 3. Gusts — sudden bursts of wind that hit randomly and fade over a few seconds

import { createNoise3D } from 'simplex-noise';

const noise3D = createNoise3D();

export class WindModel {
  /**
   * @param {object} options
   * @param {number} options.turbulenceIntensity - σ in m/s (default 1.5)
   * @param {number} options.turbulenceScale - Spatial scale in m (default 150)
   * @param {number} options.gustStrength - Peak gust speed in m/s (default 8)
   * @param {number} options.gustProbability - Probability per frame (default 0.002)
   */
  constructor(options = {}) {
    // Mean wind vector (ENU: x=East, y=North, z=Up)
    this.mean = { x: 0, y: 0, z: 0 };
    
    // Turbulence parameters
    this.turbulenceIntensity = options.turbulenceIntensity ?? 1.5;
    this.turbulenceScale = options.turbulenceScale ?? 150;
    
    // Gust parameters
    this.gustStrength = options.gustStrength ?? 8.0;
    this.gustProbability = options.gustProbability ?? 0.002;
    
    // Runtime state
    this.gust = { x: 0, y: 0, z: 0 };
    this.gustDecay = 0;
    this.t = 0;
  }

  /**
   * Set mean wind from meteorological convention
   * @param {number} fromDeg - Wind FROM direction in degrees (0=N, 90=E, 180=S, 270=W)
   * @param {number} speedMs - Wind speed in m/s
   */
  setMeanWind(fromDeg, speedMs) {
    // Convert "from" direction to "toward" direction, then to ENU components
    const toRad = (fromDeg + 180) * Math.PI / 180;
    this.mean.x = Math.sin(toRad) * speedMs;  // East component
    this.mean.y = Math.cos(toRad) * speedMs;  // North component
    this.mean.z = 0;
  }

  /**
   * Set mean wind directly in ENU components
   * @param {number} eastMs - Eastward component in m/s
   * @param {number} northMs - Northward component in m/s
   * @param {number} upMs - Upward component in m/s (usually 0)
   */
  setMeanWindENU(eastMs, northMs, upMs = 0) {
    this.mean.x = eastMs;
    this.mean.y = northMs;
    this.mean.z = upMs;
  }

  /**
   * Sample wind at a position
   * @param {number} x - East position (m) — use scaled lon
   * @param {number} y - North position (m) — use scaled lat  
   * @param {number} z - Up position / altitude (m)
   * @param {number} dt - Delta time (s)
   * @returns {{ x: number, y: number, z: number }} Wind velocity in ENU (m/s)
   */
  sample(x, y, z, dt) {
    this.t += dt;
    
    const s = this.turbulenceScale;
    const ti = this.turbulenceIntensity;
    
    // Spatially and temporally coherent turbulence via 3D simplex noise
    // Offset each component to decorrelate them
    const turbX = noise3D(x / s, y / s, this.t * 0.3) * ti;
    const turbY = noise3D(x / s + 100, y / s, this.t * 0.3) * ti;
    const turbZ = noise3D(x / s, y / s + 100, this.t * 0.3) * ti * 0.3; // Less vertical
    
    // Random gust injection
    if (Math.random() < this.gustProbability && this.gustDecay <= 0) {
      const dir = Math.random() * Math.PI * 2;
      this.gust.x = Math.cos(dir) * this.gustStrength;
      this.gust.y = Math.sin(dir) * this.gustStrength;
      this.gust.z = (Math.random() - 0.5) * this.gustStrength * 0.2;
      this.gustDecay = 1.5 + Math.random(); // 1.5-2.5 second gust duration
    }
    
    // Decay gust
    let gx = 0, gy = 0, gz = 0;
    if (this.gustDecay > 0) {
      const factor = Math.min(1, this.gustDecay / 2.0);
      gx = this.gust.x * factor;
      gy = this.gust.y * factor;
      gz = this.gust.z * factor;
      this.gustDecay -= dt;
    }

    return {
      x: this.mean.x + turbX + gx,
      y: this.mean.y + turbY + gy,
      z: this.mean.z + turbZ + gz,
    };
  }

  /**
   * Get current mean wind speed
   * @returns {number} Mean wind speed in m/s
   */
  getMeanSpeed() {
    return Math.sqrt(this.mean.x ** 2 + this.mean.y ** 2 + this.mean.z ** 2);
  }

  /**
   * Get current mean wind direction
   * @returns {number} Wind FROM direction in degrees (meteorological convention)
   */
  getMeanDirection() {
    // atan2 gives direction wind is going TO, add 180 for FROM
    const toDeg = Math.atan2(this.mean.x, this.mean.y) * 180 / Math.PI;
    return (toDeg + 180 + 360) % 360;
  }

  /**
   * Reset wind model state (call on teleport)
   */
  reset() {
    this.t = 0;
    this.gustDecay = 0;
    this.gust = { x: 0, y: 0, z: 0 };
  }
}

// ### Wind presets — ready-made weather conditions from calm to extreme wildfire winds

/** Calm conditions — light turbulence only */
export const CALM = {
  turbulenceIntensity: 0.5,
  turbulenceScale: 200,
  gustStrength: 3,
  gustProbability: 0.0005,
};

/** Moderate wind — typical operational conditions */
export const MODERATE = {
  turbulenceIntensity: 2.0,
  turbulenceScale: 150,
  gustStrength: 8,
  gustProbability: 0.002,
};

/** Strong wind — challenging but flyable */
export const STRONG = {
  turbulenceIntensity: 3.5,
  turbulenceScale: 100,
  gustStrength: 15,
  gustProbability: 0.003,
};

/** 
 * BEU Fire conditions — based on ERD Table (55 mph sustained, 100 mph gusts)
 * This is at/beyond operational limits
 */
export const BEU_FIRE = {
  turbulenceIntensity: 5.0,
  turbulenceScale: 80,
  gustStrength: 25,       // ~56 mph gusts
  gustProbability: 0.005,
};
