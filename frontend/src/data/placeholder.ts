/** Hardcoded demo payload — no API. */
export const FIELD_PLACEHOLDER = {
  zone: "B3",
  field: "North Tomato Field",
  ndvi_drop: 0.22,
  anomaly_score: 0.84,
  cause: "Possible drip-line blockage",
  priority: "High" as const,
  locationLabel: "Rows 12–16, 3.2 acres",
  workOrderId: "042",
  detectedAgo: "2 hours ago",
  rows: "12–16",
  affectedAcres: 3.2,
  waterRateGph: 150,
  costPerDayUsd: 240,
} as const;

export type FieldPlaceholder = typeof FIELD_PLACEHOLDER;
