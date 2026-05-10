// ### What this file does
// Models how air gets thinner at higher altitudes.
// Thinner air means less lift from propellers, so the drone needs more throttle to hover.
// Uses the International Standard Atmosphere (ISA) model — the same one used in real aviation.

// ### Physical constants
const R = 287.058;   // J/(kg·K) — specific gas constant for dry air
const G = 9.80665;   // m/s²
const T0 = 288.15;   // K — sea level standard temperature (15°C)
const P0 = 101325;   // Pa — sea level standard pressure
const L = 0.0065;    // K/m — temperature lapse rate (troposphere)

// ### Calculate air pressure, temperature, and density at a given altitude
/**
 * Get atmosphere properties at altitude using ISA model
 * Valid for troposphere (0 - 11,000m)
 * 
 * @param {number} altMSL - Altitude in meters above sea level
 * @returns {{ rho: number, pressure: number, temperature: number }}
 */
export function getAtmosphere(altMSL) {
  const h = Math.max(0, altMSL);  // Clamp to sea level minimum
  
  // Temperature drops linearly: T = T0 - L·h
  const T = T0 - L * h;
  
  // Pressure via barometric formula
  const P = P0 * Math.pow(T / T0, G / (L * R));
  
  // Density from ideal gas law: ρ = P / (R·T)
  const rho = P / (R * T);
  
  return { rho, pressure: P, temperature: T };
}

// ### Shortcut to get just the air density number
/**
 * Get air density at altitude
 * @param {number} altMSL - Altitude MSL in meters
 * @returns {number} Air density in kg/m³
 */
export function getAirDensity(altMSL) {
  return getAtmosphere(altMSL).rho;
}

/**
 * Get gravity at altitude (simplified, ignores latitude)
 * @param {number} altMSL - Altitude MSL in meters
 * @returns {number} Gravitational acceleration in m/s²
 */
export function getGravity(altMSL) {
  // g decreases with altitude: g = g0 * (R_earth / (R_earth + h))²
  // For drone altitudes (<10km), this is negligible (~0.3% at 10km)
  // Return constant for simplicity
  return G;
}

// Reference values for validation:
// Sea level:    ρ = 1.225 kg/m³, T = 288.15 K (15°C)
// 1500m (5000ft): ρ ≈ 1.056 kg/m³, T = 278.4 K (5.2°C)
// 2750m (9000ft): ρ ≈ 0.909 kg/m³, T = 270.3 K (-2.9°C)
