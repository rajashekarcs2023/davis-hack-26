// ### What this file does
// Draws a cyan grid in the sky at exactly 400 feet above ground level.
// The grid mirrors Cesium world terrain — each vertex sits at terrain + 400ft AGL.
// Uses async sampleTerrainMostDetailed for accurate terrain heights.
// Rendered as a Primitive with depth test disabled so it's always visible above 3D tiles.

// ### Grid settings
const AGL_CEILING    = 121.92;        // 400 ft in meters
const GRID_SIZE      = 21;            // vertices per axis (21x21 = 441 points)
const GRID_SPACING   = 80;            // meters between vertices

// ### Appearance
const GRID_RGBA      = [0.0, 0.8, 1.0, 0.7];
const LINE_WIDTH     = 2.0;

// ### Internal state
let viewer    = null;
let primitive = null;
let visible   = true;

// ### Setup — called once at startup, kicks off async terrain sampling

export function initAglCeiling(v, centerLon, centerLat, fallbackTerrainHeight) {
  viewer = v;
  buildGridAsync(centerLon, centerLat, fallbackTerrainHeight);
}

// ### No-op — grid is static once built
export function updateAglCeiling() {}

// ### Async build — samples real terrain heights then creates the primitive

async function buildGridAsync(centerLonDeg, centerLatDeg, fallbackHeight) {
  const centerLatRad = Cesium.Math.toRadians(centerLatDeg);
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos(centerLatRad);

  // Create cartographic positions for every grid vertex
  const cartoPositions = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const offsetX = (col - (GRID_SIZE - 1) / 2) * GRID_SPACING;
      const offsetY = (row - (GRID_SIZE - 1) / 2) * GRID_SPACING;
      const lon = centerLonDeg + offsetX / metersPerDegLon;
      const lat = centerLatDeg + offsetY / metersPerDegLat;
      cartoPositions.push(Cesium.Cartographic.fromDegrees(lon, lat));
    }
  }

  // Sample actual terrain heights from the terrain provider
  let heights;
  try {
    const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartoPositions);
    heights = sampled.map(c => (c.height !== undefined && Number.isFinite(c.height)) ? c.height : fallbackHeight);
  } catch (e) {
    console.warn('[agl-ceiling] Terrain sampling failed, using fallback height:', e);
    heights = new Array(GRID_SIZE * GRID_SIZE).fill(fallbackHeight);
  }

  // Build position arrays for each polyline
  const allPositions = [];

  // East-West lines (rows)
  for (let row = 0; row < GRID_SIZE; row++) {
    const coords = [];
    for (let col = 0; col < GRID_SIZE; col++) {
      const offsetX = (col - (GRID_SIZE - 1) / 2) * GRID_SPACING;
      const offsetY = (row - (GRID_SIZE - 1) / 2) * GRID_SPACING;
      coords.push(
        centerLonDeg + offsetX / metersPerDegLon,
        centerLatDeg + offsetY / metersPerDegLat,
        heights[row * GRID_SIZE + col] + AGL_CEILING,
      );
    }
    allPositions.push(Cesium.Cartesian3.fromDegreesArrayHeights(coords));
  }

  // North-South lines (columns)
  for (let col = 0; col < GRID_SIZE; col++) {
    const coords = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      const offsetX = (col - (GRID_SIZE - 1) / 2) * GRID_SPACING;
      const offsetY = (row - (GRID_SIZE - 1) / 2) * GRID_SPACING;
      coords.push(
        centerLonDeg + offsetX / metersPerDegLon,
        centerLatDeg + offsetY / metersPerDegLat,
        heights[row * GRID_SIZE + col] + AGL_CEILING,
      );
    }
    allPositions.push(Cesium.Cartesian3.fromDegreesArrayHeights(coords));
  }

  // Build geometry instances for each line
  const instances = allPositions.map(positions => {
    return new Cesium.GeometryInstance({
      geometry: new Cesium.PolylineGeometry({
        positions: positions,
        width: LINE_WIDTH,
      }),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(
          new Cesium.Color(GRID_RGBA[0], GRID_RGBA[1], GRID_RGBA[2], GRID_RGBA[3])
        ),
      },
    });
  });

  // Create a single primitive with depth testing disabled so it renders above 3D tiles
  primitive = new Cesium.Primitive({
    geometryInstances: instances,
    appearance: new Cesium.PolylineColorAppearance({
      translucent: true,
      renderState: {
        depthTest: { enabled: false },
        depthMask: false,
      },
    }),
    asynchronous: false,
  });

  primitive.show = visible;
  viewer.scene.primitives.add(primitive);
}

// ### Toggle the grid on or off when the user clicks the button

export function toggleAglCeiling() {
  visible = !visible;
  if (primitive) primitive.show = visible;
  return visible;
}

// ### HUD readout — tells the pilot how far they are from the 400ft ceiling

export function getAglCeilingStatus(droneAgl) {
  if (!visible) {
    return { text: 'OFF', color: '' };
  }

  const marginM = AGL_CEILING - droneAgl;
  const marginFt = marginM * 3.28084;

  if (marginM <= 0) {
    return { text: `CEIL ${Math.abs(marginFt).toFixed(0)}ft OVER`, color: '#ff4444' };
  } else if (marginM <= 10) {
    return { text: `CEIL ${marginFt.toFixed(0)}ft`, color: '#ffaa00' };
  } else {
    return { text: `CEIL ${marginFt.toFixed(0)}ft`, color: '#44ff44' };
  }
}
