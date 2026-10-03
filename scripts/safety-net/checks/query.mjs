// Q01–Q10 (lane 5 VISION-REACH, 2026-10-02): `query-correctness` — ten questions about Cedar Ridge's visit
// copays, each answered by the store's aggregate door (directly, as test@test.com) and by the `records` agent
// tool the chat uses today (in-process, as test@test.com), both held to hand-worked literals. The $640 / $1,440
// defect is Q01. Disposable tables are made by admin@admin.com through the store doors and archived at the end.
// Q11–Q15 (W2 verifier): related_to, a cut list says so, the roll-up door never answers a wrong 0, and the same
// questions through REST v1 and the MCP with test@test.com's own personal key (revoked after).
// Half a (area "query"). What it does not cover: the language model's own choice of call (see the probe header).
export default [
  {
    id: "query.correctness",
    area: "query",
    kind: "cmd",
    cmd: "uv",
    args: ["run", "--project", "../aidream", "python", "scripts/safety-net/probes/query_correctness.py"],
    items: ["Q01", "Q02", "Q03", "Q04", "Q05", "Q06", "Q07", "Q08", "Q09", "Q10", "Q11", "Q12", "Q13", "Q14", "Q15", "Q17", "Q18"],
    targets: ["live", "clone"],
    stepsJson: "query-correctness.json",
    timeoutMs: 10 * 60 * 1000,
  },
  // Q16 (lane 5 VISION-REACH, 2026-10-02): `only-me-listing` — a row its owner set to "Only me" is listed and counted
  // for nobody else, through every list / count / export / drill / history door, REST v1 and the MCP, on a plain, a
  // confidential-only and a restricted table. Self-test: only_me_listing_selftest.py (in-memory plant, RED).
  {
    id: "query.only-me-listing",
    area: "query",
    kind: "cmd",
    cmd: "uv",
    args: ["run", "--project", "../aidream", "python", "scripts/safety-net/probes/only_me_listing.py"],
    items: ["Q16"],
    targets: ["live", "clone"],
    stepsJson: "only-me-listing.json",
    timeoutMs: 10 * 60 * 1000,
  },
];
