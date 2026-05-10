import type { Playground } from "../types";

const BASE_LON = -122.4;
const BASE_LAT = 37.8;
// Ground plane for flat playgrounds (meters above ellipsoid)
const BASE_HEIGHT = 0;

export const slalomPlayground: Playground = {
  id: "slalom",
  name: "Slalom",
  spawn: {
    longitude: BASE_LON,
    latitude: BASE_LAT,
    // Start ~15 m above the ground
    height: BASE_HEIGHT + 15,
  },
  terrain: "flat",
  obstacles: [
    // All cylinders stand on the ground plane (BASE_HEIGHT)
    { type: "cylinder", position: { lon: BASE_LON + 0.001, lat: BASE_LAT, height: BASE_HEIGHT }, length: 18, topRadius: 3 },
    { type: "cylinder", position: { lon: BASE_LON + 0.002, lat: BASE_LAT + 0.0005, height: BASE_HEIGHT }, length: 18, topRadius: 3 },
    { type: "cylinder", position: { lon: BASE_LON + 0.003, lat: BASE_LAT, height: BASE_HEIGHT }, length: 18, topRadius: 3 },
    { type: "cylinder", position: { lon: BASE_LON + 0.004, lat: BASE_LAT - 0.0005, height: BASE_HEIGHT }, length: 18, topRadius: 3 },
    { type: "cylinder", position: { lon: BASE_LON + 0.005, lat: BASE_LAT, height: BASE_HEIGHT }, length: 18, topRadius: 3 },
    { type: "cylinder", position: { lon: BASE_LON + 0.006, lat: BASE_LAT + 0.0005, height: BASE_HEIGHT }, length: 18, topRadius: 3 },
    // Extra offset pylons to make the course denser
    { type: "cylinder", position: { lon: BASE_LON + 0.0015, lat: BASE_LAT + 0.0009, height: BASE_HEIGHT }, length: 18, topRadius: 2.5 },
    { type: "cylinder", position: { lon: BASE_LON + 0.0025, lat: BASE_LAT - 0.0009, height: BASE_HEIGHT }, length: 18, topRadius: 2.5 },
    { type: "cylinder", position: { lon: BASE_LON + 0.0035, lat: BASE_LAT + 0.0009, height: BASE_HEIGHT }, length: 18, topRadius: 2.5 },
    { type: "cylinder", position: { lon: BASE_LON + 0.0045, lat: BASE_LAT - 0.0009, height: BASE_HEIGHT }, length: 18, topRadius: 2.5 },
  ],
  waypoints: [
    // Waypoints float above the ground so you weave between pylons at low altitude
    { id: "wp1", position: { lon: BASE_LON + 0.001, lat: BASE_LAT, height: BASE_HEIGHT + 8 }, radius: 10 },
    { id: "wp2", position: { lon: BASE_LON + 0.002, lat: BASE_LAT + 0.0005, height: BASE_HEIGHT + 8 }, radius: 10 },
    { id: "wp3", position: { lon: BASE_LON + 0.003, lat: BASE_LAT, height: BASE_HEIGHT + 8 }, radius: 10 },
    { id: "wp4", position: { lon: BASE_LON + 0.004, lat: BASE_LAT - 0.0005, height: BASE_HEIGHT + 8 }, radius: 10 },
    { id: "wp5", position: { lon: BASE_LON + 0.005, lat: BASE_LAT, height: BASE_HEIGHT + 8 }, radius: 10 },
    { id: "wp6", position: { lon: BASE_LON + 0.006, lat: BASE_LAT + 0.0005, height: BASE_HEIGHT + 8 }, radius: 10 },
  ],
  timeLimit: 120,
};
