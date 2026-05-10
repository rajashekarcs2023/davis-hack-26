# Cal Fire BEU fire incidents: a complete 2022–2026 mapping dataset

**The Cal Fire San Benito-Monterey Unit (BEU) recorded at least 22 significant fire incidents between 2022 and early 2026, burning a combined ~6,500+ acres across San Benito and Monterey counties.** Eastern San Benito County's Panoche Road corridor emerged as the dominant fire hotspot, accounting for over half of all incidents. The **1,295-acre Airline Fire** (July 2024) was the largest single BEU-jurisdiction fire in the period, while the **687-acre Colorado Fire** (January 2022) in Big Sur was the most operationally complex. This report provides every documented fire with coordinates, a complete GIS data source toolkit for perimeter mapping, and available operational details for staging areas and fire origins. Notably, detailed staging site and incident command post coordinates are not publicly available for most fires — obtaining this data requires a California Public Records Act request to Cal Fire BEU.

---

## Complete fire incident inventory, 2022–2026

The table below captures all publicly documented BEU fires ≥5 acres. Cal Fire only lists fires exceeding **10 acres timber, 50 acres brush, or 300 acres grass** on their public incident pages, so this list was supplemented with local news sources to capture additional incidents. BEU responds to **7,300+ calls annually**, meaning many small vegetation fires are not tracked publicly.

| # | Fire Name | Start Date | Acres | County | Origin Coordinates | Cause | Contained |
|---|-----------|-----------|-------|--------|-------------------|-------|-----------|
| 1 | Colorado Fire | Jan 21, 2022 | 687 | Monterey | 36.3965, -121.8805 | Debris burning | Feb 5, 2022 |
| 2 | Anzar Fire | Jul 21, 2022 | 104 | San Benito | 36.8928, -121.6047 | Under investigation | Jul 27, 2022 |
| 3 | Aguajito Fire | Oct 2, 2022 | 5.2 | Monterey | ~36.58, -121.90 | Vehicle/utility pole | Oct 2, 2022 |
| 4 | Panoche Fire | Jun 22, 2023 | 145 | San Benito | Panoche Rd area | Unknown | Jun 24, 2023 |
| 5 | Bluejay Fire | Jul 11, 2023 | 20 | Monterey | Near Hwy 146/Metz Rd | Unknown | Jul 11, 2023 |
| 6 | Williams Fire | Oct 6, 2023 | 44–54 | Monterey | 36.0295, -121.0715 | Under investigation | Oct 10, 2023 |
| 7 | Panoche Fire | May 25, 2024 | 191 | San Benito | 36.5097, -120.8471 | Under investigation | Late May 2024 |
| 8 | Hernandez Fire | Jun 15, 2024 | 642 | San Benito | 36.4010, -120.9867 | Under investigation | Jun 20, 2024 |
| 9 | Airline Fire | Jul 2, 2024 | 1,295 | San Benito | 36.6592, -121.2211 | Under investigation | Jul 5, 2024 |
| 10 | Eastern Fire | ~Jul 2, 2024 | 513–566 | San Benito | Coalinga Rd area | Under investigation | ~Jul 2024 |
| 11 | Panoche Fire (trailer) | ~Jul 2, 2024 | 64 | San Benito | 20000 blk Panoche Rd | Camping trailer | Jul 2024 |
| 12 | Peach Fire | Jul 20, 2024 | 80 | Monterey | 36.1933, -120.7773 | Under investigation | Jul 23, 2024 |
| 13 | Beaver Fire | Jul 23, 2024 | 215–250 | San Benito | 36.3625, -120.8027 | Under investigation | Jul 24, 2024 |
| 14 | Pinnacles Fire | Sep 27, 2024 | 17 | San Benito | 36.4938, -121.1471 | Under investigation | Sep 28, 2024 |
| 15 | Piney Fire | Oct 8, 2024 | 225 | Monterey | 36.3789, -121.5631 | Under investigation | Oct 14, 2024 |
| 16 | Panoche Fire | Apr 20, 2025 | 29 | San Benito | Panoche/L. Panoche Rd | Unknown | Apr 20, 2025 |
| 17 | Idria Fire | May 17, 2025 | 330 | San Benito | 36.5437, -120.8357 | Firearms | May 19, 2025 |
| 18 | Grade Fire | Jun 5, 2025 | 7 | Monterey | 36.5203, -121.7570 | Under investigation | Jun 6, 2025 |
| 19 | Little Fire | Jun 11, 2025 | 586 | San Benito | 36.6561, -120.8761 | Equipment | Jun 11, 2025 |
| 20 | Panoche Fire | Aug 7, 2025 | 423 | San Benito | 36.6351, -120.9891 | Firearms | Aug 12, 2025 |
| 21 | Park Fire | Sep 2, 2025 | 25 | Monterey | 35.9453, -120.3755 | Under investigation | Sep 7, 2025 |
| 22 | Salt 14-2 Fire* | Sep 2, 2025 | 25,580 | Fresno/Monterey | Coalinga area | Under investigation | Sep 13, 2025 |

*The Salt 14-2 Fire was primarily a Fresno-Kings Unit (FKU) incident that burned into southeastern Monterey County under unified command. It is included for completeness but was not a BEU-managed fire.

**No significant BEU fires were documented for January–February 2026.** The 2023 fire season was notably quiet statewide due to wet conditions from atmospheric rivers, yielding only 2–3 documented BEU fires. The most active year was **2024, with at least 8 significant fires totaling ~3,200 acres**, concentrated in July when the Airline, Eastern, Panoche, and Beaver fires burned simultaneously in eastern San Benito County.

---

## GIS data sources and perimeter downloads for mapping

The most authoritative fire perimeter dataset for California is the **CAL FIRE FRAP (Fire and Resource Assessment Program)** historical fire perimeters, currently version **Firep24_1** (released April 2025), covering fires from 1878 through 2024 with six early-2025 perimeters. To filter for BEU fires, use the attribute field `UNIT_ID = 'BEU'` combined with `YEAR_ >= 2022`.

**Primary perimeter data sources:**

- **CAL FIRE FRAP ArcGIS Feature Service** — The best option for programmatic access. Query endpoint: `https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/California_Fire_Perimeters/FeatureServer/0/query` with parameters `where=UNIT_ID='BEU' AND YEAR_>=2022&outFields=*&f=geojson` to get GeoJSON output filtered to BEU 2022+.
- **California Natural Resources Agency Open Data** at `https://data.cnra.ca.gov/dataset/california-fire-perimeters-all` — Bulk download in Shapefile, GeoJSON, CSV, or KML formats. The entire statewide dataset can be downloaded and filtered locally.
- **California State Geoportal** at `https://gis.data.ca.gov/datasets/CALFIRE-Forestry::california-fire-perimeters-all` — Same dataset with additional export options including GeoTIFF, plus WMS/WFS API endpoints for web mapping integration.
- **CAL FIRE ArcGIS Hub** at `https://hub-calfire-forestry.hub.arcgis.com/datasets/california-fire-perimeters-all` — Interactive explorer with download options.

**For 2025 fires not yet in FRAP**, use NIFC's year-specific datasets:

- **WFIGS 2025 Wildfire Perimeters** at `https://hub-calfire-forestry.hub.arcgis.com/datasets/wfigs-2025-wildfire-perimeters`
- **NIFC Open Data Portal** at `https://data-nifc.opendata.arcgis.com/` — Contains interagency fire perimeter history for all years, current perimeters, and archived perimeters.
- **CAL FIRE Real-Time Perimeters (FIRIS)** at `https://data.ca.gov/dataset/ca-perimeters-cal-fire-nifc-firis-public-view` — Near real-time perimeters from FIRIS aerial IR platforms.

**Point-location data (fire origins, not perimeters):**

- **CAL FIRE Incident API** returns GeoJSON point data: `https://www.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList?inactive=true&year=2024` — Includes fire name, acres, location, status, and dates. Change the `year` parameter for different years.
- **NASA FIRMS** at `https://firms.modaps.eosdis.nasa.gov/` — Satellite thermal hotspot detections (not perimeters). Use bounding box **-122.1, 35.8, -120.2, 37.0** for the BEU coverage area. Requires free API key registration. Available from MODIS, VIIRS (S-NPP, NOAA-20, NOAA-21), and Landsat sensors.

**Interactive map tools for exploration:**

- **CAL FIRE Historical Wildfire Experience App** at `https://experience.arcgis.com/experience/b72eede32897423683a94c61bf9d3027/page/Historical-California-Wildfires/` — Time-based filtering with burn frequency analysis overlay.
- **CAL FIRE Burn Severity Viewer** at `https://experience.arcgis.com/experience/aff840a6cd8d4e49958f2b61982b5b11` — Burn severity (RdNBR) data for fires ≥1,000 acres from 2015–2023.

**Key FRAP attribute fields** for filtering and analysis: `UNIT_ID` (='BEU'), `YEAR_`, `ALARM_DATE`, `CONT_DATE`, `GIS_ACRES`, `CAUSE`, `FIRE_NAME`, `IRWINID` (available for 2022+ fires), and `AGENCY`. GeoMAC data has been fully retired and migrated to NIFC.

---

## Major fire case studies with operational details

### Colorado Fire (January 2022) — Big Sur's rare winter wildfire

The Colorado Fire ignited at **36.3965°N, -121.8805°W** in Palo Colorado Canyon on January 21, 2022, at approximately 7:30 PM when hot embers from a debris-burning operation were caught by extreme offshore winds gusting **50–65 mph**. The fire ran downslope southwest through brush and redwood forest toward Highway 1 and the Pacific Ocean, ultimately burning **687 acres** over 15 days.

**Terrain and access** presented severe challenges. Palo Colorado Canyon is a steep, narrow coastal drainage accessible only via Palo Colorado Road — a winding single-lane road that served as the sole ground access point. Highway 1 was closed for **21 miles** from Andrew Molera State Park to Granite Canyon Bridge. The fire burned along Long Ridge between Palo Colorado and Bixby Creek drainages, an area with no fire history. Initial acreage was estimated at 1,500 acres from ground-based assessment, later revised to 687 after aerial infrared mapping — illustrating how the rugged terrain complicated even basic size estimation. The 2016 Soberanes Fire burn scar bounded the fire's north and east flanks, acting as a natural firebreak.

Over **250 firefighters from 13 agencies** responded under unified command between Cal Fire BEU and Mid Coast Fire Brigade, with cooperators including Big Sur Volunteer Fire Department, Monterey County Regional Fire District, CHP, and California State Parks. Roughly **500 residents were evacuated**, with an evacuation center established at Carmel Middle School (**4380 Carmel Valley Road, Carmel-by-the-Sea**). One structure was destroyed and 225 were threatened. Specific ICP and staging coordinates were not publicly documented.

### Airline Fire cluster (July 2024) — Eastern San Benito's multi-fire siege

The July 2024 fire siege in eastern San Benito County represented BEU's most demanding operational period. Three fires ignited nearly simultaneously: the **Airline Fire** (origin: **36.6592°N, -121.2211°W**, 1,295 acres), the **Eastern Fire** (~566 acres along Coalinga Road), and the **Panoche Fire** (64 acres from a camping trailer that killed **three people** — a 27-year-old woman and her two children).

This remote rangeland east of Highway 25 features grass and mixed brush fuels with limited road access. **Panoche Road** served as the primary access corridor for the Airline Fire, with **Highway 25 (Airline Highway)** providing the main paved approach. The area is serviced by Cal Fire's **Beaver Dam Station (Station 61)** at 5300 Hernandez-Coalinga Road, Paicines — the closest BEU facility. At final reporting, the Airline Fire had 25 personnel, 3 engines, 1 dozer, and 1 water tender deployed, with one firefighter injured. The Beaver Fire (215 acres, origin: **36.3625°N, -120.8027°W**) ignited in the same corridor just days later on July 23.

### Williams Fire entrapment (October 2023) — A near-miss

The **44-acre Williams Fire** near Williams Hill (**36.0295°N, -121.0715°W**), west of San Ardo, is notable despite its small size because of a **firefighter entrapment event**. On October 6, 2023, a Cal Fire engine became inoperable while attempting to access the fire via Lockwood-San Lucas Road near Highway 101. Fire established in a drainage below the engine position. The crew deployed two engine protection lines and sought refuge on the passenger side of the apparatus. **Three firefighters suffered burn injuries** and were airlifted to Fresno Regional Medical Center. Near-record temperatures were recorded with an NWS heat advisory in effect. The incident was documented by the Wildland Fire Lessons Learned Center.

### Piney Fire (October 2024) — Steep terrain in upper Carmel Valley

The **225-acre Piney Fire** (origin: **36.3789°N, -121.5631°W**) ignited on October 8, 2024, at Hastings Reservation Road and Martin Road in the Jamesburg/Cachagua area of upper Carmel Valley. Cal Fire described "**very thick brush in steep terrain**" with short-range spotting during rapid initial growth from 20 to 75 acres. The fire had estimated potential for 500 acres. **Eight air tankers** were deployed alongside 225 personnel. Evacuation orders covered the 38000 block of Carmel Valley Road and all of Martin Road, with an evacuation center at Carmel Valley Library (**65 W. Carmel Valley Road**). Access was limited to Carmel Valley Road and narrow Martin Road — both winding, single-lane routes through remote terrain. **25 structures** were threatened but none damaged.

---

## Staging and operational data: what's available and what's not

**Staging site coordinates, incident command post locations, helicopter landing zones, and base camp positions are not published online** for BEU fires in this period. This operational data resides in internal Cal Fire documents:

- **ICS-209 Incident Status Summaries** — Filed for every significant incident; contain ICP coordinates, resource counts, and operational summaries. Typically restricted.
- **Incident Action Plans (IAPs)** — Internal operational documents with detailed maps, division assignments, staging locations, and helispot coordinates.
- **After-Action Reports** — No public after-action reports were located for any BEU fire from 2022–2025.

**To obtain this data**, file a California Public Records Act request with Cal Fire BEU headquarters at **(831) 647-6257**. Request ICS-209 forms and IAPs for specific incidents by name and incident number (e.g., Williams Fire: incident #23-CA-BEU-005870).

**What can be inferred from available information:**

- **Colorado Fire staging** likely utilized the Highway 1/Palo Colorado Road intersection area, given road closure patterns and evacuation logistics. Carmel Middle School served as the evacuation center.
- **Airline Fire area operations** centered on Panoche Road and Highway 25 corridor, with Beaver Dam Station (5300 Hernandez-Coalinga Rd) as the nearest Cal Fire facility.
- **Piney Fire operations** staged along Carmel Valley Road, with the library at 65 W. Carmel Valley Road serving as the evacuation center.
- **BEU key infrastructure** for staging includes the **Hollister Air Attack Base/Helibase** (aerial operations), **Gabilan Conservation Camp** (crew staging), and the **BEU Emergency Command Center** (unified command).

BEU operates **17–22 fire stations** across both counties, with communication and lookout towers at Calandra (near Lockwood), Call Mountain (NE of Pinnacles), Hernandez Mountain, Little River Hill (near Point Sur), Palo Escrito Peak (W of Soledad), Pettits Peak (SW of Greenfield), Point Sur, School Peak (San Juan Bautista), and Smith Mountain (W of Parkfield Junction).

---

## Conclusion

The BEU fire landscape from 2022 to 2026 divides into two distinct geographic zones: **coastal Monterey County** (Big Sur, Carmel Valley) with steep, densely vegetated terrain and extreme access constraints, and **eastern San Benito County** (Panoche Valley, Coalinga Road corridor) with remote rangeland where fires spread rapidly in grass and brush fuels. Eastern San Benito's Panoche Road corridor generated at least **10 separate fire incidents** in four years — a striking concentration that warrants close analysis for resource pre-positioning.

For mapping purposes, the most efficient workflow is to query the **CAL FIRE FRAP ArcGIS Feature Service** with `UNIT_ID='BEU' AND YEAR_>=2022` for perimeter polygons, supplement with **NIFC WFIGS 2025 perimeters** for the most recent fires, and overlay **NASA FIRMS hotspot data** for temporal fire progression analysis. The origin coordinates listed in the incident table above provide reliable ignition points for all fires with Cal Fire incident pages. The critical gap remains **operational infrastructure locations** — staging areas, ICPs, helispots — which require a formal Public Records Act request to Cal Fire BEU to obtain.