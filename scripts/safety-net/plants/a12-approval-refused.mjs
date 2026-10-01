// A12's red on the ADD half: the held agent write is REFUSED at the approval door instead of approved
// (through the real door, as the seat), so no row may land and the read-back must FAIL. liveSafe: a refused
// held write writes nothing; the plant changes only what the probe decides.
export default {
  id: "a12-approval-refused",
  check: "agents.a12-dataset-write",
  items: ["A12"],
  description: "the seat refuses the agent's held write at custom.work_approval_decide (nothing may land)",
  mode: "env",
  liveSafe: true,
  env: { SN_A12_PLANT: "approval-refused" },
};
