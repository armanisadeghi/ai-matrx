// A12 (chair, 2026-10-01 ~11:00 PT, from PB-02's blind BEFORE): the agents' dataset tool WRITES — one row
// added through a real agent run in Cedar Ridge (approved by the seat when the organization asks a person
// first), then CHANGED through a second run, each read back through the store's read door; disposable
// table archived at the end. Half b (area "agents"); written by SAFETY-NET at the chair's request.
export default [
  {
    id: "agents.a12-dataset-write",
    area: "agents",
    kind: "cmd",
    cmd: "uv",
    args: ["run", "--project", "../aidream", "python", "scripts/safety-net/probes/a12_dataset_write.py"],
    items: ["A12"],
    targets: ["live", "clone"],
    timeoutMs: 25 * 60 * 1000,
  },
];
