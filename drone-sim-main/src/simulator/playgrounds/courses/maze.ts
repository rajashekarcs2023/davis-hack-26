import type { Playground } from "../types";

const BASE_LON = -122.4;
const BASE_LAT = 37.8;
// Ground plane for flat playgrounds
const BASE_HEIGHT = 0;

export const mazePlayground: Playground = {
  id: "maze",
  name: "Maze",
  spawn: {
    longitude: BASE_LON,
    latitude: BASE_LAT,
    // Start slightly above the maze walls
    height: BASE_HEIGHT + 18,
  },
  terrain: "flat",
  obstacles: [
    // Walls: centers at BASE_HEIGHT + 10 so they extend from ground (0) up to 20 m
    { type: "box", position: { lon: BASE_LON + 0.0005, lat: BASE_LAT + 0.0003, height: BASE_HEIGHT + 10 }, dimensions: { length: 80, width: 10, height: 20 }, heading: 0 },
    { type: "box", position: { lon: BASE_LON + 0.0005, lat: BASE_LAT - 0.0003, height: BASE_HEIGHT + 10 }, dimensions: { length: 80, width: 10, height: 20 }, heading: 0 },
    { type: "box", position: { lon: BASE_LON + 0.0015, lat: BASE_LAT, height: BASE_HEIGHT + 10 }, dimensions: { length: 60, width: 10, height: 20 }, heading: 90 },
    { type: "box", position: { lon: BASE_LON + 0.0025, lat: BASE_LAT + 0.0003, height: BASE_HEIGHT + 10 }, dimensions: { length: 50, width: 10, height: 20 }, heading: 0 },
    { type: "box", position: { lon: BASE_LON + 0.0025, lat: BASE_LAT - 0.0003, height: BASE_HEIGHT + 10 }, dimensions: { length: 50, width: 10, height: 20 }, heading: 0 },
    { type: "box", position: { lon: BASE_LON + 0.0035, lat: BASE_LAT, height: BASE_HEIGHT + 10 }, dimensions: { length: 40, width: 10, height: 20 }, heading: 90 },
    // Extra cross walls / dead ends for more complexity
    { type: "box", position: { lon: BASE_LON + 0.001, lat: BASE_LAT + 0.0001, height: BASE_HEIGHT + 10 }, dimensions: { length: 30, width: 8, height: 20 }, heading: 90 },
    { type: "box", position: { lon: BASE_LON + 0.002, lat: BASE_LAT - 0.0001, height: BASE_HEIGHT + 10 }, dimensions: { length: 30, width: 8, height: 20 }, heading: 90 },
    { type: "box", position: { lon: BASE_LON + 0.003, lat: BASE_LAT + 0.0001, height: BASE_HEIGHT + 10 }, dimensions: { length: 24, width: 8, height: 20 }, heading: 90 },
    { type: "box", position: { lon: BASE_LON + 0.003, lat: BASE_LAT - 0.0001, height: BASE_HEIGHT + 10 }, dimensions: { length: 24, width: 8, height: 20 }, heading: 90 },
  ],
  waypoints: [
    // Waypoints slightly above the maze so you have to thread through corridors at low altitude
    { id: "start", position: { lon: BASE_LON + 0.0003, lat: BASE_LAT, height: BASE_HEIGHT + 12 }, radius: 10 },
    { id: "mid1", position: { lon: BASE_LON + 0.0018, lat: BASE_LAT + 0.00015, height: BASE_HEIGHT + 12 }, radius: 10 },
    { id: "mid2", position: { lon: BASE_LON + 0.0028, lat: BASE_LAT - 0.00015, height: BASE_HEIGHT + 12 }, radius: 10 },
    { id: "end", position: { lon: BASE_LON + 0.004, lat: BASE_LAT, height: BASE_HEIGHT + 12 }, radius: 10 },
  ],
  timeLimit: 120,
};
