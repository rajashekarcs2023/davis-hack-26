import type { Playground, Obstacle } from "./types";

export type PlaygroundLoadResult = {
  terrainProvider: any;
  obstacleEntities: any[];
  skipWorldDetailLayers: boolean;
};

export function loadPlayground(
  playground: Playground,
  viewer: any,
  excludeFromPicking?: any[]
): PlaygroundLoadResult {
  const obstacleEntities: any[] = [];

  for (const obs of playground.obstacles) {
    const entities = createObstacleEntity(obs);
    for (const entity of entities) {
      viewer.entities.add(entity);
      obstacleEntities.push(entity);
    }
  }

  const terrainProvider =
    playground.terrain === "flat" || playground.terrain === "ellipsoid"
      ? new Cesium.EllipsoidTerrainProvider()
      : new Cesium.EllipsoidTerrainProvider();

  return {
    terrainProvider,
    obstacleEntities,
    skipWorldDetailLayers: true,
  };
}

export function unloadPlayground(
  viewer: any,
  obstacleEntities: any[]
): void {
  for (const entity of obstacleEntities) {
    viewer.entities.remove(entity);
  }
}

function createObstacleEntity(obs: Obstacle): any[] {
  const entities: any[] = [];

  const position = Cesium.Cartesian3.fromDegrees(
    obs.position.lon,
    obs.position.lat,
    obs.position.height
  );

  const getColor = (c?: { red: number; green: number; blue: number; alpha?: number }, fallback?: any) => {
    return c
      ? Cesium.Color.fromBytes(
        Math.round(c.red * 255),
        Math.round(c.green * 255),
        Math.round(c.blue * 255),
        Math.round((c.alpha ?? 1.0) * 255)
      )
      : fallback ?? Cesium.Color.GRAY.withAlpha(1.0);
  };

  if (obs.type === "box") {
    const heading = obs.heading ?? 0;
    const color = getColor(obs.color, Cesium.Color.GRAY.withAlpha(1.0));
    entities.push(new Cesium.Entity({
      position,
      box: {
        dimensions: new Cesium.Cartesian3(
          obs.dimensions.length,
          obs.dimensions.width,
          obs.dimensions.height
        ),
        material: color,
        outline: true,
        outlineColor: color.brighten(0.3, new Cesium.Color()),
      },
      orientation: Cesium.Transforms.headingPitchRollQuaternion(
        position,
        new Cesium.HeadingPitchRoll(
          Cesium.Math.toRadians(heading),
          0,
          0
        ),
        Cesium.Ellipsoid.WGS84,
        Cesium.Transforms.eastNorthUpToFixedFrame
      ),
    }));
  }

  else if (obs.type === "cylinder") {
    const color = getColor(obs.color, Cesium.Color.GRAY.withAlpha(1.0));
    entities.push(new Cesium.Entity({
      position,
      cylinder: {
        length: obs.length,
        topRadius: obs.topRadius,
        bottomRadius: obs.bottomRadius ?? obs.topRadius,
        material: color,
        outline: true,
        outlineColor: color.brighten(0.3, new Cesium.Color()),
      },
    }));
  }

  else if (obs.type === "ring") {
    const innerRadius = obs.innerRadius;
    const outerRadius = obs.outerRadius;
    const segments = 32;
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(
      position,
      Cesium.Ellipsoid.WGS84,
      new Cesium.Matrix4()
    );
    const outerPositions: any[] = [];
    const innerPositions: any[] = [];
    const headingRad = Cesium.Math.toRadians(obs.heading ?? 0);
    const cosH = Math.cos(headingRad);
    const sinH = Math.sin(headingRad);
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * 2 * Math.PI;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const ox = (cosA * cosH - sinA * sinH) * outerRadius;
      const oy = (cosA * sinH + sinA * cosH) * outerRadius;
      const ix = (cosA * cosH - sinA * sinH) * innerRadius;
      const iy = (cosA * sinH + sinA * cosH) * innerRadius;
      const outer = new Cesium.Cartesian3(ox, oy, 0);
      const inner = new Cesium.Cartesian3(ix, iy, 0);
      Cesium.Matrix4.multiplyByPoint(transform, outer, outer);
      Cesium.Matrix4.multiplyByPoint(transform, inner, inner);
      outerPositions.push(outer);
      innerPositions.push(inner);
    }
    const hierarchy = new Cesium.PolygonHierarchy(outerPositions, [
      new Cesium.PolygonHierarchy(innerPositions.reverse()),
    ]);
    const color = getColor(obs.color, Cesium.Color.CYAN.withAlpha(0.5));
    entities.push(new Cesium.Entity({
      position,
      polygon: {
        hierarchy,
        extrudedHeight: 1,
        height: 0,
        material: color,
        outline: true,
        outlineColor: color.brighten(0.5, new Cesium.Color()),
      },
    }));
  }

  return entities;
}
