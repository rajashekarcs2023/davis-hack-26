export type TerrainType = "flat" | "ellipsoid" | "procedural-hills";

export interface SpawnPoint {
  longitude: number;
  latitude: number;
  height: number;
}

export type ObstacleColor = {
  red: number;    // 0.0-1.0
  green: number;
  blue: number;
  alpha?: number; // defaults to 0.9
};

export interface ObstacleBox {
  type: "box";
  position: { lon: number; lat: number; height: number };
  dimensions: { length: number; width: number; height: number };
  heading?: number;
  color?: ObstacleColor;
}

export interface ObstacleCylinder {
  type: "cylinder";
  position: { lon: number; lat: number; height: number };
  length: number;
  topRadius: number;
  bottomRadius?: number;
  color?: ObstacleColor;
}

export interface ObstacleRing {
  type: "ring";
  position: { lon: number; lat: number; height: number };
  innerRadius: number;
  outerRadius: number;
  heading?: number;
  color?: ObstacleColor;
}

export type Obstacle = ObstacleBox | ObstacleCylinder | ObstacleRing;

export interface Waypoint {
  id: string;
  position: { lon: number; lat: number; height: number };
  radius: number;
}

export interface Playground {
  id: string;
  name: string;
  spawn: SpawnPoint;
  terrain: TerrainType;
  obstacles: Obstacle[];
  waypoints?: Waypoint[];
  timeLimit?: number;
}
