Yes. Here is a teammate-ready version you can share.

---

# TerraScout AI

## Satellite-guided robotic ground-truthing for crop water stress and irrigation anomalies

### Tagline

**Satellite detects. AI reasons. Robot verifies. Farmer approves.**

---

## 1. Core idea

TerraScout AI is an AI field-triage system that helps farmers turn satellite crop-stress signals into verified, local, actionable field tasks.

Instead of claiming that a robot can “fix farming,” we are solving a narrower and more realistic problem:

> Farmers often know something may be wrong in a field, but they do not know exactly where to inspect first, whether the signal is real, or what action should be taken.

TerraScout AI uses satellite imagery to detect suspicious crop-stress zones, uses an AI agent to reason about the likely cause, then sends a drone/ground robot simulation to verify the issue locally and create a farmer-approved work order.

---

## 2. Exact problem we are solving

### Problem statement

Small and mid-size farmers do not always have an affordable, fast, and actionable way to identify which parts of a field need immediate inspection for possible irrigation failure or crop water stress.

Satellite imagery can show vegetation anomalies, but it usually does not directly answer:

* Is this anomaly real or just noise?
* Is it likely irrigation stress, disease, weeds, or normal variation?
* Which exact zone should be inspected first?
* What should the farmer do next?
* Can we generate a clear work order instead of just showing a map?

So our wedge is:

> **Convert remote-sensing crop anomalies into verified, field-level action.**

---

## 3. Why this is real and not force-fitted

The drone/robot should not be framed as a magical farm fixer.

The real role is:

### Satellite layer

Detects the macro signal:

> “Zone B3 has abnormal vegetation health.”

Sentinel-2 is suitable for this because it provides multispectral imagery across 13 bands, with 10 m, 20 m, and 60 m spatial resolutions depending on the band. This is commonly used for vegetation and land monitoring. ([Copernicus Data Space Ecosystem][1])

### Drone layer

Provides close-up visual verification:

> “Does this patch actually look dry, yellow, damaged, or stressed?”

### Ground robot layer

Performs local ground-truthing:

> “Move to the suspicious zone, collect close-up evidence, mark the area, and create a work order.”

### Human layer

The farmer approves or rejects the action:

> “Yes, inspect this zone” or “No, ignore this anomaly.”

This makes the robot/drone useful because the real bottleneck is not “autonomous repair.” The real bottleneck is **turning coarse satellite signals into trusted, local, farmer-actionable evidence.**

---

## 4. Why this matters socially

This fits HackDavis’s social-good theme because it supports:

* water-efficient farming
* crop-loss prevention
* small-farmer decision support
* climate-resilient agriculture
* reduced manual inspection labor
* smarter irrigation management

NASA describes NDVI as a way to measure vegetation “greenness,” and vegetation indices are widely used to study agriculture, climate, and natural-disaster impacts. NDVI is calculated from red and near-infrared reflectance, and higher values generally indicate greener vegetation. ([NASA Earthdata][2])

So the technical basis is real: vegetation stress can be detected from spectral signals, but farmers still need help turning that signal into a decision.

---

## 5. Product vision

A farmer opens the TerraScout mobile web app in the morning.

The app says:

> “Zone B3 has a 22% vegetation-health drop compared to nearby zones. The shape follows a row pattern, which may indicate irrigation-line blockage. Recommended next step: dispatch robotic inspection.”

The farmer taps:

> **Approve Inspection**

Then the system:

1. Creates an AI inspection plan.
2. Sends action tokens to the DAC robot simulator.
3. Robot moves toward the target zone.
4. Robot/drone camera collects local visual evidence.
5. AI generates a work order:

   > “Inspect drip line near Zone B3 / Row 14. Close-up evidence suggests localized water stress. Priority: high.”

---

## 6. Main demo flow

### Demo scene

A farm field is divided into zones: A1, A2, B1, B2, B3, etc.

### Step 1: Satellite anomaly

The dashboard highlights Zone B3.

Example:

```json
{
  "field": "North Tomato Field",
  "zone": "B3",
  "anomaly_type": "Possible irrigation stress",
  "ndvi_drop": 0.22,
  "anomaly_score": 0.84
}
```

### Step 2: AI reasoning

Claude explains:

> “Zone B3 shows a localized vegetation-health drop compared to nearby zones. Because the pattern follows a row-like structure, this may indicate uneven water delivery or drip-line blockage.”

### Step 3: Human approval

The farmer sees the plan on mobile and taps:

> **Approve Robotic Inspection**

### Step 4: Robot action

The backend sends action tokens to DAC RobotSim.

Example:

```json
[
  { "action": "drive_forward", "magnitude": 0.6 },
  { "action": "rotate_left", "magnitude": 0.3 },
  { "action": "drive_forward", "magnitude": 0.5 },
  { "action": "shoulder_down", "magnitude": 0.4 },
  { "action": "grip", "magnitude": 0.2 }
]
```

### Step 5: Verification

The VLM checks the robot/drone camera frame and confirms whether the local evidence matches the satellite anomaly.

### Step 6: Work order

The app generates:

> “High priority: inspect irrigation line near Zone B3. Evidence: localized vegetation drop, dry-soil visual evidence, row-aligned stress pattern.”

---

## 7. Prize alignment

### Best Use of DAC Materials

This is our primary track.

HackDavis says this prize requires using DAC materials with a vision-based AI pipeline, including VLMs or VLAs, to connect real-world visual perception to physical robotic behavior. ([HackDavis][3])

Our fit:

* use DAC robot simulation
* use camera frames
* use VLM scene understanding
* use Claude as action planner
* output robot action tokens
* close the loop with robot state and visual verification

### Best AI/ML Hack

This is our second major target.

We will not pitch this as “Claude controls a robot.” We will pitch it as a measured AI/ML pipeline:

1. satellite anomaly detection
2. crop-stress classification
3. VLM close-up verification
4. action recommendation
5. robot task execution
6. human approval
7. evaluation metrics on unseen cases

### Most Technically Challenging Hack

Strong fit because we combine:

* satellite imagery
* NDVI/anomaly detection
* Claude agent reasoning
* VLM/VLA pipeline
* robot simulation
* mobile approval UI
* backend action execution
* evaluation dashboard

### Best Statistical Model

Possible if we show:

* NDVI distributions
* anomaly thresholds
* precision/recall
* false-positive rate
* hypothesis testing
* before/after triage efficiency

### Best UI/UX

Possible if the mobile web app is clean:

* anomaly card
* approve/reject buttons
* robot status
* confidence score
* work order summary
* map/field zone view

---

# 8. Data: what can we actually use?

This is the most important part.

## Data availability verdict

Yes, data is available.

But we need to be honest:

> Public satellite data exists. Public crop-type and vegetation data exists. Public irrigation-stress labels are harder to find. So for the hackathon, we should combine real satellite signals with generated/weak labels and simulated robot inspection scenes.

That is acceptable if we clearly explain our data collection process.

---

## Dataset option 1: Sentinel-2 imagery

Use for:

* multispectral satellite imagery
* NDVI calculation
* vegetation anomaly detection
* field zone visualization

Sentinel-2 provides 13 spectral bands and is available globally, with 10 m, 20 m, and 60 m resolution depending on the band. ([Copernicus Data Space Ecosystem][1])

How we use it:

* Red band + NIR band → NDVI
* divide field into zones
* compare zone NDVI to neighboring zones
* flag abnormal low-NDVI zones

Hackathon-friendly version:

* use pre-downloaded Sentinel-2 tiles or sample images
* compute NDVI locally
* avoid spending too much time on live satellite APIs

---

## Dataset option 2: NASA HLS

Use for:

* easier analysis-ready satellite surface reflectance
* time-series vegetation monitoring
* combining Landsat + Sentinel-2 observations

NASA’s Harmonized Landsat and Sentinel-2 project produces global land-surface reflectance data at 30 m resolution, with frequent observations from Landsat and Sentinel-2. ([NASA Earthdata][4])

Why useful:

* already harmonized
* good for time-series anomaly detection
* easier to explain as a serious remote-sensing dataset

Hackathon use:

* use HLS as the “real future production data source”
* MVP can use a sample tile or synthetic field grid

---

## Dataset option 3: USDA Cropland Data Layer

Use for:

* identifying crop/field areas
* filtering out non-cropland
* crop-type context

The USDA Cropland Data Layer is a raster, geo-referenced, crop-specific land-cover dataset. The 2022 California CDL has 30 m resolution, and USDA notes that CDL resolution increased to 10 m beginning in 2024. ([National Agricultural Statistics Service][5])

How we use it:

* mask out non-agricultural land
* identify crop type if available
* make the system more grounded than just “random satellite image”

---

## Dataset option 4: OpenET

Use for:

* evapotranspiration/water-use context
* irrigation stress reasoning
* stronger water-management story

OpenET provides satellite-based evapotranspiration data for water management, and NASA describes OpenET as using public satellite data to provide evapotranspiration information. ([OpenET][6])

USGS also describes OpenET as providing 30 m spatial, daily temporal evapotranspiration data in a California almond-orchard evaluation context. ([USGS][7])

How we use it:

* compare vegetation stress with ET/water-use signal
* support the claim that this is about irrigation/water stress
* future version can recommend irrigation inspection more intelligently

Hackathon use:

* optional
* use as a supporting data source, not required for MVP

---

## Dataset option 5: CIMIS weather data

Use for:

* local weather context
* reference evapotranspiration
* heat/drought stress context

CIMIS is California’s irrigation weather network. It has more than 145 active weather stations and provides weather data such as solar radiation, precipitation, temperature, humidity, wind speed, and reference evapotranspiration estimates. ([CIMIS][8])

How we use it:

* “This week had high evapotranspiration and low precipitation”
* support the AI reasoning
* reduce false alarms from normal seasonal variation

Hackathon use:

* optional
* can hardcode one weather-context card if API access takes too long

---

## Dataset option 6: CropHarvest

Use for:

* ML benchmark / crop classification
* showing that we understand remote-sensing ML
* optional model training baseline

CropHarvest is an open-source remote-sensing agriculture dataset with more than 90,000 geographically diverse samples and agricultural labels. ([OpenReview][9])

How we use it:

* not directly for irrigation failure
* useful for crop/non-crop or crop-type classification
* can mention as a benchmark dataset, but not the main MVP data

---

# 9. Best data strategy for the hackathon

We should not overcomplicate the MVP by trying to build a fully real satellite pipeline on day one.

## Use a 3-layer data strategy

### Layer 1: Real remote-sensing foundation

Use Sentinel-2 / HLS / NDVI conceptually and, if possible, with one or two sample tiles.

This makes the project scientifically grounded.

### Layer 2: Hackathon-generated labeled dataset

Create our own small dataset of field-zone scenarios.

Example labels:

```json
{
  "scene_id": "field_042",
  "zone": "B3",
  "ndvi_drop": 0.22,
  "pattern": "row_aligned",
  "soil_context": "dry",
  "weather_context": "high_eto",
  "label": "needs_irrigation_inspection",
  "recommended_action": "robot_ground_truth"
}
```

Generate 100–300 samples:

* normal zone
* mild stress
* severe stress
* row-aligned stress
* random patchy stress
* false alarm
* non-crop area
* cloud/noisy satellite reading

### Layer 3: Robot simulation scenes

Use DAC RobotSim to show physical verification.

Labels:

```json
{
  "robot_scene_id": "robot_021",
  "visual_evidence": ["dry soil", "yellowing leaves"],
  "needs_work_order": true,
  "correct_robot_goal": "inspect_and_mark"
}
```

This gives us a clean story:

> “We combined real satellite-derived vegetation indices with a labeled simulation dataset for evaluating anomaly triage and robotic verification.”

---

# 10. AI/ML metrics we should show

For Best AI/ML, we need a metrics page.

Suggested metrics:

| Metric                                                | Meaning                                                |
| ----------------------------------------------------- | ------------------------------------------------------ |
| NDVI anomaly detection accuracy                       | Did we correctly flag stressed zones?                  |
| Precision/recall for inspection-needed classification | Did we avoid too many false alarms?                    |
| False-positive rate                                   | How often did we send robot unnecessarily?             |
| Correct action recommendation rate                    | Did AI choose inspect / ignore / work order correctly? |
| Robot task success rate                               | Did robot execute the action-token plan?               |
| Average action count                                  | How efficiently did robot complete inspection?         |
| Unseen scene accuracy                                 | Does it work on new field layouts?                     |

This is very important. It separates us from “LLM wrapper” projects.

---

# 11. MVP features

## Must-have

1. Mobile-first web app
2. Demo satellite field map with anomaly zone
3. AI-generated inspection plan
4. Farmer approve/reject buttons
5. Robot action-token execution
6. Work order generation
7. Basic metrics page

## Nice-to-have

1. Real Sentinel-2 sample NDVI map
2. Claude-generated reasoning
3. VLM analysis of robot camera frame
4. Evaluation dataset viewer
5. Weather/ET context card
6. Human override logs

## Avoid for MVP

1. Live satellite API dependency
2. Real drone hardware
3. claiming robot fixes irrigation
4. too many crop diseases
5. wildfire response
6. overcomplicated maps

---

# 12. Technical architecture

```text
Mobile Web App
   ↓
Farmer sees anomaly + approves inspection
   ↓
FastAPI / Node Backend
   ↓
Satellite Anomaly Module
NDVI + field-zone anomaly score
   ↓
Claude Agent
Reasoning + inspection plan + work order text
   ↓
VLM / Vision Module
Close-up verification from robot/drone frame
   ↓
VLA Action Planner
Converts plan into robot action tokens
   ↓
DAC RobotSim
Executes physical behavior
   ↓
Evaluation Dashboard
Metrics + logs + outcome
```

---

# 13. What we should say to judges

The strongest explanation:

> TerraScout AI does not try to replace farmers. It solves the missing middle between satellite monitoring and real field action. Satellite imagery can reveal that a crop zone may be stressed, but it cannot always explain the cause or generate a local work order. Our system uses AI to prioritize suspicious zones, sends a robotic scout to ground-truth the issue, and gives the farmer an approval-based action plan.

Killer line:

> **We turn remote-sensing anomalies into verified field work orders.**

---

# 14. Final project summary for teammates

**Project name:** TerraScout AI
**Problem:** Farmers need a faster way to convert satellite crop-stress signals into verified, local, actionable field tasks.
**Solution:** Use satellite imagery/NDVI to detect suspicious crop-stress zones, Claude to reason about likely causes, DAC robot simulation to perform ground-truth inspection, and a mobile web app for farmer approval and work-order generation.
**Why now:** Remote-sensing data is available, but the action layer is still fragmented. Farmers need decision support, not just maps.
**Why robotics:** The robot is not force-fitted; it performs local verification, evidence collection, and marking — the missing step between satellite detection and human action.
**Primary prizes:** Best Use of DAC Materials + Best AI/ML Hack.
**Secondary prizes:** Most Technically Challenging, Best Statistical Model, Best UI/UX, Best User Research.
**Data plan:** Use Sentinel-2/HLS/NDVI as the real satellite foundation, USDA CDL for crop context, optional OpenET/CIMIS for water/weather context, and a hackathon-generated labeled dataset for evaluation.

My recommendation: lock the exact use case as **irrigation-stress ground-truthing**, not general crop disease, not wildfire, and not generic farm robotics. This is the clearest, most realistic, and most prize-aligned version.

[1]: https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-2?utm_source=chatgpt.com "Sentinel-2"
[2]: https://www.earthdata.nasa.gov/topics/land-surface/normalized-difference-vegetation-index-ndvi?utm_source=chatgpt.com "Normalized Difference Vegetation Index (NDVI)"
[3]: https://hackdavis.io/?utm_source=chatgpt.com "HackDavis 2026"
[4]: https://www.earthdata.nasa.gov/data/projects/hls?utm_source=chatgpt.com "HLS - Harmonized Landsat and Sentinel-2"
[5]: https://www.nass.usda.gov/Research_and_Science/Cropland/metadata/metadata_ca22.htm?utm_source=chatgpt.com "2022 California Cropland Data Layer | USDA NASS"
[6]: https://etdata.org/?utm_source=chatgpt.com "OpenET: Open-Source Transparent Water Management Data"
[7]: https://www.usgs.gov/publications/a-comparative-analysis-openet-evaluating-evapotranspiration-california-almond-orchards?utm_source=chatgpt.com "A comparative analysis of OpenET for evaluating ..."
[8]: https://cimis.water.ca.gov/SpatialData.aspx?utm_source=chatgpt.com "Spatial Overview"
[9]: https://openreview.net/forum?id=JtjzUXPEaCu&utm_source=chatgpt.com "CropHarvest: A global dataset for crop-type classification"
