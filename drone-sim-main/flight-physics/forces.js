// ### What this file does
// Calculates all the physical forces acting on the drone each frame:
// thrust (propellers pushing up), drag (air resistance slowing it down),
// and gravity (pulling it down). These determine how the drone accelerates.

import { getAirDensity } from './atmosphere.js';
import { getTotalMass } from './drone-config.js';

const G = 9.80665; // m/s²

// ### Thrust — how much upward force the propellers produce at a given throttle
/**
 * Calculate X8 coaxial thrust
 * ERD Equation: T = C_T · ρ · n² · D⁴
 * With coaxial efficiency loss on bottom rotors
 * 
 * @param {number} throttle - 0 to 1
 * @param {object} config - Drone configuration
 * @param {number} altMSL - Altitude MSL for air density
 * @returns {number} Total thrust in Newtons
 */
export function calculateThrust(throttle, config, altMSL) {
  const rho = getAirDensity(altMSL);
  const { propDiameter, thrustCoeff, maxRPM, coaxialEfficiency, numRotors } = config.propulsion;
  
  // RPM from throttle, convert to rev/sec
  const n = (throttle * maxRPM) / 60;
  const D = propDiameter;
  
  // Single rotor thrust: T = C_T · ρ · n² · D⁴
  const Tsingle = thrustCoeff * rho * n * n * Math.pow(D, 4);
  
  // X8 has 4 coaxial pairs
  // Top rotor: full efficiency (1.0)
  // Bottom rotor: reduced efficiency (η ≈ 0.75-0.85)
  // Pair thrust: T_pair = T_single * (1 + η)
  const numPairs = numRotors / 2;
  const Tpair = Tsingle * (1 + coaxialEfficiency);
  
  return numPairs * Tpair;
}

// ### Hover throttle — finds the exact throttle setting to stay perfectly still in the air
/**
 * Calculate throttle needed for hover at given conditions
 * Uses binary search since thrust is nonlinear in throttle
 * 
 * @param {object} config - Drone configuration
 * @param {number} altMSL - Altitude MSL
 * @param {number} thrustMargin - Extra thrust factor (1.0 = exact hover, 1.1 = 10% margin)
 * @returns {number} Throttle value 0-1
 */
export function hoverThrottle(config, altMSL, thrustMargin = 1.0) {
  const weight = getTotalMass(config) * G * thrustMargin;
  
  // Binary search for throttle
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (calculateThrust(mid, config, altMSL) < weight) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

// ### Drag — air resistance that slows the drone down when it moves
/**
 * Calculate aerodynamic drag force magnitude
 * ERD Equation: D = ½ρV²·Cd·A
 * 
 * @param {number} speedRel - Speed relative to air (m/s)
 * @param {object} config - Drone configuration
 * @param {number} altMSL - Altitude for air density
 * @param {number} verticalFraction - 0-1, fraction of motion that is vertical
 * @returns {number} Drag force magnitude in Newtons
 */
export function calculateDragMagnitude(speedRel, config, altMSL, verticalFraction = 0) {
  if (speedRel < 0.01) return 0;
  
  const rho = getAirDensity(altMSL);
  const { frontalArea, topArea, Cd } = config.drag;
  
  // Blend between frontal area (horizontal flight) and top area (vertical descent)
  const effectiveArea = frontalArea * (1 - verticalFraction) + topArea * verticalFraction;
  
  // D = ½ρV²CdA
  return 0.5 * rho * speedRel * speedRel * Cd * effectiveArea;
}

// ### Main force calculator — combines thrust, drag, and gravity into net acceleration
/**
 * Compute all forces and return acceleration components
 * Main entry point called from app.js each frame
 * 
 * @param {object} params
 * @param {number} params.throttle - 0 to 1
 * @param {object} params.windENU - Wind velocity { x, y, z } in ENU (m/s)
 * @param {object} params.velocityENU - Drone velocity { x, y, z } in ENU (m/s)
 * @param {number} params.altMSL - Altitude MSL (m)
 * @param {object} params.config - Drone configuration
 * @returns {object} Force analysis results
 */
export function computeForces(params) {
  const { throttle, windENU, velocityENU, altMSL, config } = params;
  const mass = getTotalMass(config);
  
  // ─────────────────────────────────────────────────────────────────────────
  // THRUST (along body Z-axis, simplified to world up for Phase 1)
  // ─────────────────────────────────────────────────────────────────────────
  const thrust = calculateThrust(throttle, config, altMSL);
  const thrustAccelZ = thrust / mass;  // m/s² upward
  
  // ─────────────────────────────────────────────────────────────────────────
  // VELOCITY RELATIVE TO AIR (for drag calculation)
  // ─────────────────────────────────────────────────────────────────────────
  const vRelX = velocityENU.x - windENU.x;
  const vRelY = velocityENU.y - windENU.y;
  const vRelZ = velocityENU.z - windENU.z;
  
  const speedRel = Math.sqrt(vRelX * vRelX + vRelY * vRelY + vRelZ * vRelZ);
  const horizSpeedRel = Math.sqrt(vRelX * vRelX + vRelY * vRelY);
  
  // Vertical fraction for drag area blending
  const vertFrac = speedRel > 0.1 ? Math.abs(vRelZ) / speedRel : 0;
  
  // ─────────────────────────────────────────────────────────────────────────
  // DRAG (opposes velocity relative to air)
  // ─────────────────────────────────────────────────────────────────────────
  const dragMag = calculateDragMagnitude(speedRel, config, altMSL, vertFrac);
  const dragAccel = dragMag / mass;
  
  // Drag acceleration components (normalized by relative velocity direction)
  let dragAccelX = 0, dragAccelY = 0, dragAccelZ = 0;
  if (speedRel > 0.01) {
    const invSpeed = 1 / speedRel;
    dragAccelX = -dragAccel * vRelX * invSpeed;
    dragAccelY = -dragAccel * vRelY * invSpeed;
    dragAccelZ = -dragAccel * vRelZ * invSpeed;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // GRAVITY (always down in ENU)
  // ─────────────────────────────────────────────────────────────────────────
  const gravityAccelZ = -G;
  
  // ─────────────────────────────────────────────────────────────────────────
  // RETURN ALL COMPONENTS
  // ─────────────────────────────────────────────────────────────────────────
  return {
    // Acceleration components in ENU frame (m/s²)
    thrustAccelZ,
    dragAccelX,
    dragAccelY,
    dragAccelZ,
    gravityAccelZ,
    
    // Net vertical acceleration
    netAccelZ: thrustAccelZ + dragAccelZ + gravityAccelZ,
    
    // Diagnostic values
    thrust,               // N
    dragMag,              // N  
    rho: getAirDensity(altMSL),  // kg/m³
    speedRelativeToAir: speedRel,
    windSpeed: Math.sqrt(windENU.x ** 2 + windENU.y ** 2 + windENU.z ** 2),
  };
}

// ### Hover check — can the drone stay airborne at this altitude with this payload?
/**
 * Check if drone can maintain hover at given conditions
 * @param {object} config - Drone configuration
 * @param {number} altMSL - Altitude MSL
 * @returns {{ canHover: boolean, hoverThrottle: number, thrustMargin: number }}
 */
export function checkHoverCapability(config, altMSL) {
  const weight = getTotalMass(config) * G;
  const maxThrust = calculateThrust(1.0, config, altMSL);
  const hoverThrot = hoverThrottle(config, altMSL);
  
  return {
    canHover: maxThrust >= weight,
    hoverThrottle: hoverThrot,
    thrustMargin: maxThrust / weight,  // >1 means can hover, >1.5 good maneuverability
  };
}
