// Regenerates src/data/stationFootprints.json from the supplied station GeoJSON.
//   npm run data:footprints          write the file
//   npm run data:footprints -- --check   fail if the checked-in file is out of date
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildStationFootprints } from "../src/features/journey-map/stationFootprints.build.ts";

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const sourcePath = resolve("../../data/AmendmenttoMP2014RailStation.geojson");
const stationsPath = resolve("../../backend/app/data/stations.json");
const outputPath = resolve("../src/data/stationFootprints.json");

const data = buildStationFootprints(
  JSON.parse(readFileSync(sourcePath, "utf8")),
  JSON.parse(readFileSync(stationsPath, "utf8")),
);
const output = `${JSON.stringify(data)}\n`;

const { coordinateSystem: crs, footprints, unmatched, stationsWithoutFootprint } = data;
console.log(`CRS: declared none; confirmed ${crs.inferredCrs} (${crs.axisOrder}) across ${crs.featureCount} features`);
console.log(`Area check vs SHAPE_1.AREA: median ${(crs.medianAreaError * 100).toFixed(2)}%, max ${(crs.maxAreaError * 100).toFixed(2)}%`);
const byMatch = Object.groupBy(footprints, (footprint) => footprint.match);
console.log(`Matched ${footprints.length} footprints: ${Object.entries(byMatch).map(([kind, items]) => `${items?.length} by ${kind}`).join(", ")}`);
console.log(`Unmatched footprints: ${unmatched.length} (${unmatched.filter((item) => item.type === "LRT").length} LRT)`);
for (const item of unmatched.filter((entry) => entry.type !== "LRT")) console.log(`  ${item.objectId} ${item.sourceName ?? "(unnamed)"}: ${item.reason}`);
console.log(`Stations without a footprint (${stationsWithoutFootprint.length}): ${stationsWithoutFootprint.join(", ")}`);

if (process.argv.includes("--check")) {
  if (readFileSync(outputPath, "utf8") !== output) {
    console.error("src/data/stationFootprints.json is out of date; run npm run data:footprints");
    process.exit(1);
  }
  console.log("Checked-in footprints are up to date.");
} else {
  writeFileSync(outputPath, output);
  console.log(`Wrote ${outputPath} (${(output.length / 1024).toFixed(0)} KB)`);
}
