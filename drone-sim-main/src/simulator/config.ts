export const DEFAULT_CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN ?? "";

export const START_LOCATION = {
  longitude: -121.7617,
  latitude: 38.5382,
  // 8m AGL — just above the backend's safety floor (safety_drone_min_agl_m=8m).
  // Drone reads as "on the launch pad" so the first dispatch's prepended ASCEND
  // beat looks like a clear takeoff lifting toward cruise altitude. Was 180m
  // AGL, which spawned the drone already at altitude with no liftoff feel.
  height: 8.0,
};

export const UCD_LOCATION = {
  longitude: -121.7617,
  latitude: 38.5382,
  height: 200.0,
};

export const FLIGHT = {
  gravity: 9.81,
  horizontalAcceleration: 22.0,
  maxHorizontalSpeed: 20.0,
  horizontalDrag: 6.0,
  verticalAcceleration: 14.0,
  maxVerticalSpeed: 10.0,
  verticalDrag: 5.0,
  yawRate: Cesium.Math.toRadians(90.0),
  maxVisualPitch: Cesium.Math.toRadians(25.0),
  maxVisualRoll: Cesium.Math.toRadians(15.0),
  visualTiltRate: 5.0,
  visualTiltReturn: 6.0,
  minimumClearance: 2.0,
  cameraForwardOffset: -18.0,
  cameraUpOffset: 6.0,
  cameraLookAboveOffset: 6.0,
};

export const BUILDING_COLLISION = {
  enabled: true,
  activationAltitudeAGL: 500,
  minimumClearance: 6.0,
  forwardCheckDistance: 5,
  wallStopDistance: 5,
  deflectionStrength: 1,
  pushbackDistance: 6.0,
  numRays: 5,
  reflectOnImpact: true,
  slideAlongSurface: false,
  energyLoss: 0.3,
};

export const CHASE_FOV = Cesium.Math.toRadians(119.6);
export const FPV_FOV = Cesium.Math.toRadians(140.0);
export const FPV_PITCH_DOWN = Cesium.Math.toRadians(-45.0);

export const CAMERA_CHASE = 0;
export const CAMERA_FPV = 1;

export const SPEED_TIERS = [1, 3, 5, 10];

export const KEY_BLOCKLIST = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyS",
  "KeyA",
  "KeyD",
  "KeyC",
]);
