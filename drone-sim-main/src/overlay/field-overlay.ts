/**
 * TerraScout Farm Field Overlay
 *
 * Renders a 4×4 grid of NDVI crop-stress zones on top of the Cesium globe over
 * the UC Davis North Tomato Field, color-coded by anomaly score, with a
 * pulsing red beacon over the top-anomaly zone (B3).
 *
 * Pairs with `backend/app/data/field_grid.json` — the lat/lons of every zone
 * are kept in sync with the backend so the sim and the agent agree on where
 * each zone is on the planet.
 */

interface Zone {
  id: string;
  lat: number;
  lon: number;
  ndvi: number;
  baseline: number;
  score: number;
}

interface OverviewLocation {
  longitude: number;
  latitude: number;
  height: number;
  /** Optional drone heading in degrees (0 = north, 90 = east, 180 = south, 270 = west). */
  heading?: number;
}

const ZONE_DISC_RADIUS_M = 80;
const ZONE_LABEL_FONT = 'bold 13px "Space Mono", monospace';
const BEACON_HEIGHT = 800;
const BEACON_WIDTH_INNER = 8;
const BEACON_WIDTH_OUTER = 22;
const BEACON_GLOW_INNER = 0.30;
const BEACON_GLOW_OUTER = 0.55;
const BEACON_TAPER = 0.85;
const FIELD_OUTLINE_WIDTH = 3;

const FIELD = {
  id: "ucd_north_tomato",
  name: "UCD North Tomato Field",
  unit: "Yolo County, CA — synthetic NDVI",
  rows: 4,
  cols: 4,
  centerLat: 38.5382,
  centerLon: -121.7617,
};

// Mirrors backend/app/data/field_grid.json
const ZONES: Zone[] = [
  { id: "A1", lat: 38.5418, lon: -121.7662, ndvi: 0.66, baseline: 0.65, score: 0.05 },
  { id: "A2", lat: 38.5418, lon: -121.7639, ndvi: 0.64, baseline: 0.65, score: 0.06 },
  { id: "A3", lat: 38.5418, lon: -121.7616, ndvi: 0.67, baseline: 0.65, score: 0.04 },
  { id: "A4", lat: 38.5418, lon: -121.7593, ndvi: 0.65, baseline: 0.65, score: 0.05 },
  { id: "B1", lat: 38.5394, lon: -121.7662, ndvi: 0.62, baseline: 0.64, score: 0.10 },
  { id: "B2", lat: 38.5394, lon: -121.7639, ndvi: 0.58, baseline: 0.64, score: 0.22 },
  { id: "B3", lat: 38.5394, lon: -121.7616, ndvi: 0.42, baseline: 0.64, score: 0.84 },
  { id: "B4", lat: 38.5394, lon: -121.7593, ndvi: 0.60, baseline: 0.64, score: 0.13 },
  { id: "C1", lat: 38.5370, lon: -121.7662, ndvi: 0.61, baseline: 0.64, score: 0.11 },
  { id: "C2", lat: 38.5370, lon: -121.7639, ndvi: 0.55, baseline: 0.64, score: 0.42 },
  { id: "C3", lat: 38.5370, lon: -121.7616, ndvi: 0.59, baseline: 0.64, score: 0.18 },
  { id: "C4", lat: 38.5370, lon: -121.7593, ndvi: 0.63, baseline: 0.64, score: 0.07 },
  { id: "D1", lat: 38.5346, lon: -121.7662, ndvi: 0.63, baseline: 0.64, score: 0.06 },
  { id: "D2", lat: 38.5346, lon: -121.7639, ndvi: 0.64, baseline: 0.64, score: 0.05 },
  { id: "D3", lat: 38.5346, lon: -121.7616, ndvi: 0.62, baseline: 0.64, score: 0.07 },
  { id: "D4", lat: 38.5346, lon: -121.7593, ndvi: 0.65, baseline: 0.64, score: 0.04 },
];

const TOP_ANOMALY_ID = "B3";

let entities: any[] = [];
let visible = true;

function scoreToCss(score: number): string {
  if (score >= 0.60) return "#ff4444";
  if (score >= 0.30) return "#ffaa33";
  if (score >= 0.15) return "#ffd344";
  return "#44dd66";
}

function scoreToLabel(score: number): string {
  if (score >= 0.60) return "Inspect";
  if (score >= 0.30) return "Patchy";
  if (score >= 0.15) return "Watch";
  return "Healthy";
}

/** Build all 3D entities (perimeter polygon, per-zone discs/labels, B3 beacon, center title). */
export function initFieldOverlay(viewer: any): void {
  // 1. Field perimeter polygon
  const perimeterCoords: number[] = [];
  const corners = [
    { lat: 38.5418, lon: -121.7662 },
    { lat: 38.5418, lon: -121.7593 },
    { lat: 38.5346, lon: -121.7593 },
    { lat: 38.5346, lon: -121.7662 },
  ];
  for (const c of corners) {
    perimeterCoords.push(c.lon, c.lat);
  }
  entities.push(
    viewer.entities.add({
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(perimeterCoords),
        material: Cesium.Color.fromCssColorString("#44dd66").withAlpha(0.10),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#44dd66").withAlpha(0.45),
        outlineWidth: FIELD_OUTLINE_WIDTH,
        height: 0,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    }),
  );

  // 2. Per-zone disc + label, plus beacon for the top anomaly
  for (const z of ZONES) {
    const css = scoreToCss(z.score);
    const color = Cesium.Color.fromCssColorString(css);
    const isAnomaly = z.id === TOP_ANOMALY_ID;

    entities.push(
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(z.lon, z.lat),
        ellipse: {
          semiMajorAxis: ZONE_DISC_RADIUS_M,
          semiMinorAxis: ZONE_DISC_RADIUS_M,
          height: 0,
          material: color.withAlpha(isAnomaly ? 0.55 : 0.30),
          outline: true,
          outlineColor: color.withAlpha(0.85),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      }),
    );

    entities.push(
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(z.lon, z.lat, 12),
        label: {
          text: `${z.id}\nNDVI ${z.ndvi.toFixed(2)}\n${scoreToLabel(z.score)}`,
          font: ZONE_LABEL_FONT,
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          pixelOffset: new Cesium.Cartesian2(0, -8),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          showBackground: true,
          backgroundColor: new Cesium.Color(0, 0, 0, 0.55),
          backgroundPadding: new Cesium.Cartesian2(8, 5),
          scaleByDistance: new Cesium.NearFarScalar(300, 1.0, 5000, 0.4),
          translucencyByDistance: new Cesium.NearFarScalar(2000, 1.0, 12000, 0.25),
        },
      }),
    );

    if (isAnomaly) {
      // Outer halo beam
      entities.push(
        viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              z.lon, z.lat, 0,
              z.lon, z.lat, BEACON_HEIGHT,
            ]),
            width: BEACON_WIDTH_OUTER,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: BEACON_GLOW_OUTER,
              taperPower: BEACON_TAPER,
              color: color.withAlpha(0.18),
            }),
          },
        }),
      );
      // Inner core beam
      entities.push(
        viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              z.lon, z.lat, 0,
              z.lon, z.lat, BEACON_HEIGHT,
            ]),
            width: BEACON_WIDTH_INNER,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: BEACON_GLOW_INNER,
              taperPower: BEACON_TAPER,
              color: color.withAlpha(0.85),
            }),
          },
        }),
      );
      // Floating call-out at the top of the beam
      entities.push(
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(z.lon, z.lat, BEACON_HEIGHT + 40),
          label: {
            text: `Zone ${z.id} — irrigation stress\nNDVI drop ${(z.baseline - z.ndvi).toFixed(2)}  ·  score ${z.score.toFixed(2)}`,
            font: 'bold 14px "Space Mono", monospace',
            fillColor: Cesium.Color.fromCssColorString("#ffe0e0"),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            pixelOffset: new Cesium.Cartesian2(0, -10),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            showBackground: true,
            backgroundColor: new Cesium.Color(0.4, 0, 0, 0.7),
            backgroundPadding: new Cesium.Cartesian2(10, 6),
            scaleByDistance: new Cesium.NearFarScalar(500, 1.0, 30000, 0.4),
          },
        }),
      );
    }
  }

  // 3. Field-name center title
  entities.push(
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(FIELD.centerLon, FIELD.centerLat, 60),
      label: {
        text: `${FIELD.name.toUpperCase()}\n${FIELD.unit}`,
        font: 'bold 16px "Rajdhani", sans-serif',
        fillColor: Cesium.Color.fromCssColorString("#82e3ff"),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        showBackground: true,
        backgroundColor: new Cesium.Color(0, 0.05, 0.1, 0.65),
        backgroundPadding: new Cesium.Cartesian2(12, 7),
        scaleByDistance: new Cesium.NearFarScalar(500, 1.0, 50000, 0.5),
      },
    }),
  );
}

/** Idempotently create the field-status legend container and return its body element. */
function ensureLegendContainer(): HTMLElement | null {
  const existing = document.getElementById("incident-body");
  if (existing) return existing;

  const panel = document.createElement("aside");
  panel.id = "incident-panel";
  panel.innerHTML = `
    <header id="incident-header">
      <span class="panel-title" style="margin:0;">Field Status</span>
      <span id="incident-arrow">▾</span>
    </header>
    <div id="incident-body"></div>
  `;
  document.body.appendChild(panel);
  return document.getElementById("incident-body");
}

/** Render the bottom-right field status legend (info, top-anomaly callout, mini-grid, legend, actions). */
export function buildFieldStatusLegend(opts: {
  onTeleport?: () => void;
  onToggle?: () => void;
} = {}): void {
  const body = ensureLegendContainer();
  if (!body) return;

  const info = document.createElement("div");
  info.id = "incident-info";
  info.innerHTML =
    `<strong>${FIELD.name}</strong><br>` +
    `${FIELD.unit} &middot; ${FIELD.rows}×${FIELD.cols} grid`;
  body.appendChild(info);

  const top = ZONES.find((z) => z.id === TOP_ANOMALY_ID);
  if (top) {
    const callout = document.createElement("div");
    callout.className = "incident-callout";
    callout.innerHTML =
      `<span class="callout-dot" style="background:${scoreToCss(top.score)}"></span>` +
      `<span><strong>Zone ${top.id}</strong> &middot; score ${top.score.toFixed(2)}</span>` +
      `<span class="callout-sub">irrigation stress (row-aligned)</span>`;
    body.appendChild(callout);
  }

  const grid = document.createElement("div");
  grid.id = "incident-grid";
  for (const z of ZONES) {
    const tile = document.createElement("div");
    tile.className = "incident-tile";
    if (z.id === TOP_ANOMALY_ID) tile.classList.add("top-anomaly");
    tile.style.background = scoreToCss(z.score);
    tile.title = `${z.id} · NDVI ${z.ndvi.toFixed(2)} · score ${z.score.toFixed(2)}`;
    tile.textContent = z.id;
    grid.appendChild(tile);
  }
  body.appendChild(grid);

  const legend = document.createElement("div");
  legend.id = "incident-legend";
  const tiers = [
    { label: "Inspect (≥ 0.60)", css: "#ff4444" },
    { label: "Patchy (≥ 0.30)", css: "#ffaa33" },
    { label: "Watch (≥ 0.15)", css: "#ffd344" },
    { label: "Healthy", css: "#44dd66" },
  ];
  for (const t of tiers) {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML =
      `<span class="legend-dot" style="background:${t.css}"></span>` +
      `<span class="legend-label">${t.label}</span>`;
    legend.appendChild(item);
  }
  body.appendChild(legend);

  const actions = document.createElement("div");
  actions.className = "incident-actions";
  actions.innerHTML =
    `<button id="incident-toggle-btn" class="speed-btn" type="button">HIDE</button>` +
    `<button id="incident-teleport-btn" class="speed-btn" type="button">FLY TO B3</button>`;
  body.appendChild(actions);

  // Wire up toggle/teleport buttons (callers can override via opts).
  const toggleBtn = document.getElementById("incident-toggle-btn") as HTMLButtonElement | null;
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const vis = toggleFieldOverlay();
      toggleBtn.textContent = vis ? "HIDE" : "SHOW";
      toggleBtn.classList.toggle("active", vis);
      opts.onToggle?.();
      toggleBtn.blur();
    });
  }

  const teleportBtn = document.getElementById("incident-teleport-btn") as HTMLButtonElement | null;
  if (teleportBtn && opts.onTeleport) {
    teleportBtn.addEventListener("click", () => {
      opts.onTeleport!();
      teleportBtn.blur();
    });
  }

  // Header click toggles collapse
  const header = document.getElementById("incident-header");
  const arrow = document.getElementById("incident-arrow");
  if (header) {
    header.addEventListener("click", () => {
      body.classList.toggle("collapsed");
      if (arrow) {
        arrow.style.transform = body.classList.contains("collapsed")
          ? "rotate(-90deg)"
          : "";
      }
    });
  }
}

export function toggleFieldOverlay(): boolean {
  visible = !visible;
  for (const e of entities) e.show = visible;
  return visible;
}

export function isFieldOverlayVisible(): boolean {
  return visible;
}

/**
 * Drone anchor for the "FLY TO B3" button.
 *
 * We park the drone ~200 m NORTH of B3 facing SOUTH at a low-ish crop
 * inspection altitude (~35 m AGL) so:
 *   • the chase camera already shows the field clearly on spawn (no sky dominance)
 *   • the descent leg has a punchy, visible drop (~25 m to the 22 m target)
 *     instead of a glacial 78 m fall that overshoots the safety budget
 *   • the strafe-scan flourish reads as a low-altitude inspection sweep,
 *     not a high-altitude survey wobble
 */
export const FIELD_OVERVIEW_LOCATION: OverviewLocation = {
  longitude: -121.7616,        // B3 longitude
  latitude: 38.5412,           // ~200 m north of B3 (B3 lat 38.5394)
  height: 50,                  // 50 m above ellipsoid → ~34 m AGL over Davis
  heading: 180,                // face SOUTH so chase camera looks at B3
};
