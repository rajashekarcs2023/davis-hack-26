
const BASE_LON = -122.4;
const BASE_LAT = 37.8;
const H = 0;

function generateForest(minLonOffset, maxLonOffset, minLatOffset, maxLatOffset, density) {
  const trees = [];
  const lonStep = 0.0001; // ~9m
  const latStep = 0.0001; // ~11m

  for (let lon = minLonOffset; lon <= maxLonOffset; lon += lonStep) {
    for (let lat = minLatOffset; lat <= maxLatOffset; lat += latStep) {
      if (Math.random() > (1 - density)) {
        const offLon = (Math.random() - 0.5) * 0.00005;
        const offLat = (Math.random() - 0.5) * 0.00005;

        const variants = ["pine", "oak", "cypress"];
        const variant = variants[Math.floor(Math.random() * variants.length)];
        const height = 8 + Math.random() * 5;
        const radius = 0.4 + Math.random() * 0.2;
        const canopy = 3.5 + Math.random() * 2;

        trees.push({
          type: "tree",
          position: { lon: parseFloat((BASE_LON + lon + offLon).toFixed(7)), lat: parseFloat((BASE_LAT + lat + offLat).toFixed(7)), height: H },
          trunkHeight: parseFloat(height.toFixed(1)),
          trunkRadius: parseFloat(radius.toFixed(2)),
          canopyRadius: parseFloat(canopy.toFixed(1)),
          variant
        });
      }
    }
  }
  return trees;
}

// B1: Forest Supply Drop
const b1Trees = generateForest(-0.0002, 0.001, -0.0005, 0.001, 0.75);
console.log(JSON.stringify(b1Trees, null, 2));
