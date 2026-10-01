// A12's planted wrong-shape argument: the agent is told to pass the row's values to the dataset tool as a
// JSON ARRAY instead of field -> value pairs. The tool must refuse it, no row lands, and A12 goes RED.
// liveSafe: it changes only what the probe ASKS the agent; no server, table or row is touched by the plant.
export default {
  id: "a12-wrong-shape",
  check: "agents.a12-dataset-write",
  items: ["A12"],
  description: "the agent is told to send the row's values as a JSON array (a wrong-shape argument)",
  mode: "env",
  liveSafe: true,
  env: { SN_A12_PLANT: "wrong-shape" },
};
