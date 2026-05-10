// ### What this file does
// Defines the physical specs of two drones: ATLAS (full-size heavy-lift) and DEV (small test drone).
// These numbers control how the drone flies — heavier drones need more thrust, bigger props
// generate more lift, and drag depends on the drone's shape and size.

// ### ATLAS — full-size 8-rotor heavy-lift drone (45kg, 48-inch propellers)
export const ATLAS_CONFIG = {
  name: 'ATLAS',

  // Mass properties (ERD Section 3.1, 7)
  mass: {
    shell: 45.0,        // kg — frame + battery + electronics
    payloadMax: 68.0,   // kg — 150 lbf
    payloadCurrent: 0,  // kg — runtime adjustable
  },

  // Propulsion (ERD Section 3.2, 6)
  propulsion: {
    numRotors: 8,             // X8 coaxial configuration
    propDiameter: 1.219,      // m — 48" HF 48175 props
    thrustCoeff: 0.012,       // C_T (from prop data)
    coaxialEfficiency: 0.80,  // η_X8 — bottom rotor wake loss (ERD: 0.75-0.85)
    maxRPM: 3000,             // From X11 MAX specs
  },

  // Aerodynamics (ERD Section 3.1)
  drag: {
    frontalArea: 0.8,   // m² — X8 frame cross-section
    topArea: 2.5,       // m² — plan view (for descent)
    Cd: 1.0,            // bluff body drag coefficient
  },

  // Flight envelope (ERD Section 2.2)
  envelope: {
    maxAltitudeMSL: 2750,   // m — 9000 ft operational limit
    maxWindSpeed: 25,       // m/s — ~55 mph sustained ops limit
  },
};

// ### DEV — small lightweight test drone (5kg) used during development
export const DEV_CONFIG = {
  name: 'DEV',

  mass: {
    shell: 5.0,          // kg — small test drone (~11 lbs)
    payloadMax: 5.0,
    payloadCurrent: 0,
  },

  propulsion: {
    numRotors: 8,
    propDiameter: 0.6,
    thrustCoeff: 0.011,
    coaxialEfficiency: 0.85,
    maxRPM: 8000,         // higher RPM for smaller props
  },

  drag: {
    frontalArea: 0.15,
    topArea: 0.4,
    Cd: 1.0,
  },

  envelope: {
    maxAltitudeMSL: 3000,
    maxWindSpeed: 20,
  },
};

// ### Helper functions to calculate derived values from the config
/**
 * Get total mass including current payload
 * @param {object} config - Drone configuration
 * @returns {number} Total mass in kg
 */
export function getTotalMass(config) {
  return config.mass.shell + config.mass.payloadCurrent;
}

/**
 * Get total disk area for all rotors
 * @param {object} config - Drone configuration
 * @returns {number} Total disk area in m²
 */
export function getDiskArea(config) {
  const r = config.propulsion.propDiameter / 2;
  return config.propulsion.numRotors * Math.PI * r * r;
}
