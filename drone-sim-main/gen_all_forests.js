
const BASE_LON = -122.4;
const BASE_LAT = 37.8;

function generateTrees(minLonOffset, maxLonOffset, minLatOffset, maxLatOffset, density, lonStep = 0.00012, latStep = 0.00012) {
  const trees = [];
  const minSafeDist = 0.00025; // ~22 meters safe zone from (0,0)

  for (let lon = minLonOffset; lon <= maxLonOffset; lon += lonStep) {
    for (let lat = minLatOffset; lat <= maxLatOffset; lat += latStep) {
      if (Math.random() > (1 - density)) {
        // Skip if too close to spawn (0,0)
        const dist = Math.sqrt(lon * lon + lat * lat);
        if (dist < minSafeDist) continue;

        const offLon = (Math.random() - 0.5) * (lonStep * 0.8);
        const offLat = (Math.random() - 0.5) * (latStep * 0.8);

        const variants = ["pine", "oak", "cypress"];
        const variant = variants[Math.floor(Math.random() * variants.length)];
        const height = 8 + Math.random() * 5;
        const radius = 0.35 + Math.random() * 0.15;
        const canopy = 1.8 + Math.random() * 1.0; // Reduced from 3.5-5.5 to 1.8-2.8

        trees.push(`    { type: "tree", position: { lon: ${(BASE_LON + lon + offLon).toFixed(7)}, lat: ${(BASE_LAT + lat + offLat).toFixed(7)}, height: 0 }, trunkHeight: ${height.toFixed(1)}, trunkRadius: ${radius.toFixed(2)}, canopyRadius: ${canopy.toFixed(1)}, variant: "${variant}" },`);
      }
    }
  }
  return trees;
}

console.log("// --- B1 ---");
console.log(generateTrees(-0.0002, 0.001, -0.0005, 0.001, 0.75, 0.0001, 0.0001).join("\n"));

console.log("\n// --- B2 ---");
// B2 Target is lon: +0.0007, lat: 0. spawn: 0,0. Path is basically E.
console.log(generateTrees(-0.0001, 0.0008, -0.0004, 0.0004, 0.7, 0.00012, 0.00012).join("\n"));

console.log("\n// --- B3 ---");
// Alpha: lon: 0.00012, lat: 0.00063
// Bravo: lon: 0.00063, lat: 0.00009
console.log(generateTrees(-0.0001, 0.0007, -0.0001, 0.0007, 0.8, 0.0001, 0.0001).join("\n"));

console.log("\n// --- B4 ---");
// WP1: lon: +0.00045, lat: +0.00045
// WP2: lon: +0.00045, lat: -0.00045
// Final: lon: +0.001, lat: 0
console.log(generateTrees(-0.0001, 0.0011, -0.0006, 0.0006, 0.65, 0.00012, 0.00012).join("\n"));
