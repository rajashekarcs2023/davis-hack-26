/**
 * Zone catalog for the demo field. The visual map shows 4 quadrants
 * (Zone A / B / C / D), each backed by a real backend `zone_id` from
 * `backend/app/data/field_grid.json`. Picking ONE representative
 * sub-zone per quadrant keeps the UX simple while letting the user fire
 * a real scan (any zone, not just the alert one).
 *
 * The "B3 hotspot" remains the auto-flagged demo case — every other
 * quadrant maps to a low-anomaly sub-zone so the field looks healthy
 * overall, with a single alert standing out.
 */

export type ZoneStatus = "healthy" | "watch" | "alert";

export type ZoneInfo = {
  /** Visual id used in the UI ("A" / "B" / "C" / "D"). */
  id: "A" | "B" | "C" | "D";
  /** Human-readable label for the zone pill. */
  label: string;
  /**
   * Backend zone id passed to /api/runs?zone_id=... — must match an
   * entry in backend/app/data/field_grid.json. We pick one
   * representative sub-zone per quadrant.
   */
  backendZoneId: string;
  /** Acres covered by this quadrant (for stat display). */
  acres: number;
  /** Crop name (display only). */
  crop: string;
  /** Latest NDVI reading from the backend grid (display only). */
  ndvi: number;
  /** Backend's anomaly score for this representative sub-zone, 0..1. */
  anomalyScore: number;
  /**
   * Coarse status pill bucket. `alert` = AgriScout flagged it overnight
   * and is recommending action. `watch` = mild anomaly, monitoring only.
   * `healthy` = nothing to see.
   */
  status: ZoneStatus;
  /**
   * Headline copy used on the alert/manual-scan card. Filled in for the
   * alert zone only; other zones get a generic "manual scan" prompt.
   */
  alertHeadline?: string;
  /** Detail copy used on the alert card. */
  alertDetail?: string;
  /** Last-scan stub for the activity feed and zone tile. */
  lastScanLabel?: string;
};

export const ZONES: ZoneInfo[] = [
  {
    id: "A",
    label: "Zone A",
    backendZoneId: "A2",
    acres: 3.1,
    crop: "Strawberry",
    ndvi: 0.64,
    anomalyScore: 0.06,
    status: "healthy",
    lastScanLabel: "Last scan 2 days ago · stable",
  },
  {
    id: "B",
    label: "Zone B",
    backendZoneId: "B3",
    acres: 3.2,
    crop: "Strawberry",
    ndvi: 0.42,
    anomalyScore: 0.84,
    status: "alert",
    alertHeadline: "Canopy stress hotspot",
    alertDetail:
      "NDVI dropped 22% overnight in a row-aligned pattern · 84% anomaly · cause TBD (pest / water / nutrient)",
    lastScanLabel: "Detected 4:32 AM by Sentinel-2A",
  },
  {
    id: "C",
    label: "Zone C",
    backendZoneId: "C2",
    acres: 2.8,
    crop: "Strawberry",
    ndvi: 0.55,
    anomalyScore: 0.42,
    status: "watch",
    lastScanLabel: "NDVI down 9% · monitoring",
  },
  {
    id: "D",
    label: "Zone D",
    backendZoneId: "D2",
    acres: 3.0,
    crop: "Strawberry",
    ndvi: 0.64,
    anomalyScore: 0.05,
    status: "healthy",
    lastScanLabel: "Last scan 3 days ago · stable",
  },
];

export const DEFAULT_ZONE_ID: ZoneInfo["id"] = "B";

export function getZoneByVisualId(id: ZoneInfo["id"]): ZoneInfo {
  const z = ZONES.find((zz) => zz.id === id);
  if (!z) throw new Error(`unknown visual zone ${id}`);
  return z;
}

export function getAlertZone(): ZoneInfo | null {
  return ZONES.find((z) => z.status === "alert") ?? null;
}
