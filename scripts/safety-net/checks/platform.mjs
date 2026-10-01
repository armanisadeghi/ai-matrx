// Checks for area "platform" (owner SAFETY-NET).
export default [
  {
    id: "platform.walk-platform",
    area: "platform",
    kind: "walk",
    file: "scripts/safety-net/walks/platform.mjs",
    walkName: "platform",
    items: ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09"],
    targets: ["live", "clone"],
  },
];
