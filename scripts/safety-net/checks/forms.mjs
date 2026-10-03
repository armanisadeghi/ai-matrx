// Checks for area "forms" (owner MAKE-HOME, wave 5 guard G4).
export default [
  {
    id: "forms.walk-public-form",
    area: "forms",
    kind: "walk",
    file: "scripts/safety-net/walks/public-form.mjs",
    walkName: "public-form",
    items: ["F01", "F02"],
    targets: ["live", "clone"],
  },
];
