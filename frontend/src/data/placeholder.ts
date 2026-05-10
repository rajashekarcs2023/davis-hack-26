/** Hardcoded demo payload — no API.
 *
 * AgriScout pivot: zone id stays "B3" (matches backend field grid). Copy is
 * deliberately cause-agnostic: AgriScout escalates sensing for ANY canopy
 * stress (pest, water, nutrient, disease, false alarm) and lets the
 * diagnostic loop decide. The demo zone happens to land on a pest hotspot,
 * but the system framing must read as a general field diagnostician.
 * Keep backend ids stable so /api/risk/B3 etc. continue to work.
 *
 * Note: `zone` is typed as `string` (not the literal "B3") because App.tsx
 * overrides it at runtime to whichever zone the user has selected — the
 * backend zone id flows from `selectedZone.backendZoneId` so a manual
 * scan on Zone A actually fires zone_id=A2 against the backend grid.
 * Other fields stay as B3-flavored static demo decoration.
 */
export type FieldPlaceholder = {
  zone: string;
  field: string;
  ndvi_drop: number;
  anomaly_score: number;
  cause: string;
  priority: "High" | "Medium" | "Low";
  locationLabel: string;
  workOrderId: string;
  detectedAgo: string;
  rows: string;
  affectedAcres: number;
  waterRateGph: number;
  costPerDayUsd: number;
  cropType: string;
  plantStage: string;
};

export const FIELD_PLACEHOLDER: FieldPlaceholder = {
  zone: "B3",
  field: "Strawberry Block B-3",
  ndvi_drop: 0.22,
  anomaly_score: 0.84,
  cause: "Canopy stress hotspot — cause TBD; drone confirmation needed",
  priority: "High",
  locationLabel: "Rows 12–16, 3.2 acres",
  workOrderId: "042",
  detectedAgo: "2 hours ago",
  rows: "12–16",
  affectedAcres: 3.2,
  // Cost / rate values exist because the work-order panel still surfaces
  // them. Production would compute these per zone from observed loss rate.
  waterRateGph: 150,
  costPerDayUsd: 240,
  cropType: "Strawberry",
  plantStage: "Vulnerable (fruiting)",
};
