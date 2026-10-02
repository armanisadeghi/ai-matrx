// Q01–Q10 (lane 5 VISION-REACH, 2026-10-02): `query-correctness` — ten questions about Cedar Ridge's visit
// copays, each answered by the store's aggregate door (directly, as test@test.com) and by the `records` agent
// tool the chat uses today (in-process, as test@test.com), both held to hand-worked literals. The $640 / $1,440
// defect is Q01. Disposable tables are made by admin@admin.com through the store doors and archived at the end.
// Half a (area "query"). What it does not cover: the language model's own choice of call (see the probe header).
export default [
  {
    id: "query.correctness",
    area: "query",
    kind: "cmd",
    cmd: "uv",
    args: ["run", "--project", "../aidream", "python", "scripts/safety-net/probes/query_correctness.py"],
    items: ["Q01", "Q02", "Q03", "Q04", "Q05", "Q06", "Q07", "Q08", "Q09", "Q10"],
    targets: ["live", "clone"],
    stepsJson: "query-correctness.json",
    timeoutMs: 10 * 60 * 1000,
  },
];
