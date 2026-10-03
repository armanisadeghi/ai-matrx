// Checks for area "custom-fields" (lane 7 STANDARD-TABLES W5, guard G1 live part).
export default [
  {
    id: "custom-fields.walk-every-record-view",
    area: "custom-fields",
    kind: "walk",
    file: "scripts/safety-net/walks/custom-fields-everywhere.mjs",
    walkName: "custom-fields-everywhere",
    items: ["CF01"],
    targets: ["live", "clone"],
    liveReadOnly: true,
  },
];
