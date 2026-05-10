import type { Waypoint } from "./playgrounds/types";

export interface FlightMetricsResult {
  collisionCount: number;
  waypointsReached: Set<string>;
  startTime: number;
  elapsedTime: number;
  pathDistance: number;
  straightLineDistance: number;
  success: boolean;
  score: number;
}

export class FlightMetrics {
  private collisionCount = 0;
  private waypointsReached = new Set<string>();
  private startTime = 0;
  private pathDistance = 0;
  private lastPosition: { x: number; y: number; z: number } | null = null;
  private waypoints: Waypoint[] = [];
  private startPosition: { x: number; y: number; z: number } | null = null;

  reset(waypoints?: Waypoint[]): void {
    this.collisionCount = 0;
    this.waypointsReached.clear();
    this.startTime = performance.now() / 1000;
    this.pathDistance = 0;
    this.lastPosition = null;
    this.waypoints = waypoints ?? [];
    this.startPosition = null;
  }

  recordCollision(): void {
    this.collisionCount++;
  }

  recordWaypointReached(id: string): void {
    this.waypointsReached.add(id);
  }

  updatePosition(x: number, y: number, z: number): void {
    if (this.startPosition === null) {
      this.startPosition = { x, y, z };
    }
    if (this.lastPosition) {
      const dx = x - this.lastPosition.x;
      const dy = y - this.lastPosition.y;
      const dz = z - this.lastPosition.z;
      this.pathDistance += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    this.lastPosition = { x, y, z };
  }

  checkWaypointProximity(
    x: number,
    y: number,
    z: number,
    waypoints: Waypoint[],
    toCartesian: (lon: number, lat: number, height: number) => { x: number; y: number; z: number }
  ): void {
    for (const wp of waypoints) {
      if (this.waypointsReached.has(wp.id)) continue;
      const wpCart = toCartesian(wp.position.lon, wp.position.lat, wp.position.height);
      const dx = x - wpCart.x;
      const dy = y - wpCart.y;
      const dz = z - wpCart.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist <= wp.radius) {
        this.recordWaypointReached(wp.id);
      }
    }
  }

  getElapsedTime(): number {
    return performance.now() / 1000 - this.startTime;
  }

  getResult(timeLimit?: number, toCartesian?: (lon: number, lat: number, height: number) => { x: number; y: number; z: number }): FlightMetricsResult {
    const now = performance.now() / 1000;
    const elapsedTime = now - this.startTime;

    let straightLineDistance = 0;
    if (this.startPosition && this.lastPosition && toCartesian) {
      const dx = this.lastPosition.x - this.startPosition.x;
      const dy = this.lastPosition.y - this.startPosition.y;
      const dz = this.lastPosition.z - this.startPosition.z;
      straightLineDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const allWaypointsReached =
      this.waypoints.length === 0 ||
      this.waypoints.every((wp) => this.waypointsReached.has(wp.id));
    const withinTimeLimit = !timeLimit || elapsedTime <= timeLimit;
    const noCollisions = this.collisionCount === 0;
    const success = allWaypointsReached && withinTimeLimit && noCollisions;

    const pathEfficiency =
      straightLineDistance > 0 ? straightLineDistance / Math.max(this.pathDistance, 1) : 1;
    const waypointScore =
      this.waypoints.length > 0
        ? this.waypointsReached.size / this.waypoints.length
        : 1;
    const collisionPenalty = Math.max(0, 1 - this.collisionCount * 0.2);
    const timeBonus = timeLimit && withinTimeLimit ? 1 : 0.5;
    const score =
      (waypointScore * 0.5 + pathEfficiency * 0.2 + collisionPenalty * 0.3) * timeBonus;

    return {
      collisionCount: this.collisionCount,
      waypointsReached: new Set(this.waypointsReached),
      startTime: this.startTime,
      elapsedTime,
      pathDistance: this.pathDistance,
      straightLineDistance,
      success,
      score: Math.round(score * 100) / 100,
    };
  }

  isComplete(waypoints?: Waypoint[], timeLimit?: number): boolean {
    const wps = waypoints ?? this.waypoints;
    const allReached = wps.length === 0 || wps.every((wp) => this.waypointsReached.has(wp.id));
    const elapsed = performance.now() / 1000 - this.startTime;
    const timedOut = timeLimit !== undefined && elapsed > timeLimit;
    return allReached || timedOut;
  }
}
