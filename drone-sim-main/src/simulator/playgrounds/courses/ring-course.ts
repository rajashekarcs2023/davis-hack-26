import type { Playground } from "../types";

const BASE_LON = -122.4;
const BASE_LAT = 37.8;
// Ground plane for flat playgrounds
const BASE_HEIGHT = 0;

export const ringCoursePlayground: Playground = {
  id: "ring-course",
  name: "Ring Course",
  spawn: {
    longitude: BASE_LON,
    latitude: BASE_LAT,
    // Start a bit above ground so you can dive into the first ring
    height: BASE_HEIGHT + 12,
  },
  terrain: "flat",
  obstacles: [
    // Rings stacked at different heights and lateral offsets above ground
    { type: "ring", position: { lon: BASE_LON + 0.001, lat: BASE_LAT, height: BASE_HEIGHT + 6 }, innerRadius: 6, outerRadius: 9 },
    { type: "ring", position: { lon: BASE_LON + 0.002, lat: BASE_LAT + 0.0003, height: BASE_HEIGHT + 9 }, innerRadius: 6, outerRadius: 9 },
    { type: "ring", position: { lon: BASE_LON + 0.003, lat: BASE_LAT, height: BASE_HEIGHT + 12 }, innerRadius: 6, outerRadius: 9 },
    { type: "ring", position: { lon: BASE_LON + 0.004, lat: BASE_LAT - 0.0003, height: BASE_HEIGHT + 9 }, innerRadius: 6, outerRadius: 9 },
    { type: "ring", position: { lon: BASE_LON + 0.005, lat: BASE_LAT, height: BASE_HEIGHT + 6 }, innerRadius: 6, outerRadius: 9 },
    // Extra outer lane of rings for a more complex course
    { type: "ring", position: { lon: BASE_LON + 0.0015, lat: BASE_LAT + 0.0007, height: BASE_HEIGHT + 7 }, innerRadius: 5, outerRadius: 8 },
    { type: "ring", position: { lon: BASE_LON + 0.0035, lat: BASE_LAT + 0.0007, height: BASE_HEIGHT + 11 }, innerRadius: 5, outerRadius: 8 },
    { type: "ring", position: { lon: BASE_LON + 0.0045, lat: BASE_LAT - 0.0007, height: BASE_HEIGHT + 8 }, innerRadius: 5, outerRadius: 8 },
  ],
  waypoints: [
    // Waypoints centered roughly in each primary ring
    { id: "ring1", position: { lon: BASE_LON + 0.001, lat: BASE_LAT, height: BASE_HEIGHT + 6 }, radius: 6 },
    { id: "ring2", position: { lon: BASE_LON + 0.002, lat: BASE_LAT + 0.0003, height: BASE_HEIGHT + 9 }, radius: 6 },
    { id: "ring3", position: { lon: BASE_LON + 0.003, lat: BASE_LAT, height: BASE_HEIGHT + 12 }, radius: 6 },
    { id: "ring4", position: { lon: BASE_LON + 0.004, lat: BASE_LAT - 0.0003, height: BASE_HEIGHT + 9 }, radius: 6 },
    { id: "ring5", position: { lon: BASE_LON + 0.005, lat: BASE_LAT, height: BASE_HEIGHT + 6 }, radius: 6 },
    // Optional side lane waypoints
    { id: "ring6", position: { lon: BASE_LON + 0.0015, lat: BASE_LAT + 0.0007, height: BASE_HEIGHT + 7 }, radius: 5 },
    { id: "ring7", position: { lon: BASE_LON + 0.0035, lat: BASE_LAT + 0.0007, height: BASE_HEIGHT + 11 }, radius: 5 },
  ],
  timeLimit: 90,
};
