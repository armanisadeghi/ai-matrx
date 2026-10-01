# Plants — one planted break per check, on the CLONE only

A plant file is `plants/<plant-id>.mjs` with a default export:

```js
export default {
  id: "tables-retype-loses-values",          // = the file name
  check: "tables.walk-life",                  // the ONE check it must turn red
  items: ["T26"],                             // the items that must FAIL with it (and only those, ideally)
  description: "the column door drops values on a retype (clone, Cedar Ridge only)",
  mode: "in-transaction" | "committed" | "vars" | "env" | "intercept",
  rules: [{ match: "/rpc/read_records_page", action: "drop", keep: 100 }], // mode intercept (walks): see lib/harness.mjs INTERCEPTS
  vars: { plant: "nolane" },                  // mode vars: switch on a suite's OWN built-in plant (-v plant=…)
  env: { SN_PLANT_X: "1" },                   // mode env: only for a check whose fault is outside this repo's DB (say why)
  apply: "SQL",                               // as postgres on the clone
  restore: "SQL",                             // committed only; runs in finally
  captureRestore: "SQL whose output is the restore SQL", // optional, e.g. select pg_get_functiondef('custom.x(uuid)'::regprocedure)
  readback: "SQL that prints t when restored", // committed only; required
};
```

- `in-transaction` (SQL checks): the runner sends `begin; <apply>; \i <suite>; rollback;` in one session,
  so the break never commits.
- `committed` (walks, which read through the app): applied, the check runs, then `restore` runs in
  `finally` and `readback` must print `t` or the runner exits 5 and says so. Scope every committed
  plant to the fixture organization (Cedar Ridge `0a54df90-eab8-4d07-ab29-81a45fb41e04`) or the run's
  fixture names, keep the window short, and never across a turn boundary.
- `intercept` (walks, live OR clone): the break is planted at the network boundary of the run's own
  test browser (an answer dropped, refused, rewritten, or a write that claims success without being
  sent). Nothing on any server changes, so it is the one plant allowed on live. The walk's JSON lists
  every interception; a red run whose intercept never fired proves nothing.
- Prefer breaking DATA on the clone (a knob, a membership, a list binding, a function body guarded
  by the fixture org) over code. Never sed-mutate a file in the checkout.
- Prove: `node scripts/safety-net/run.mjs --target clone --plant <id>` → the items FAIL;
  `node scripts/safety-net/run.mjs --target clone --only <check>` → they PASS.
