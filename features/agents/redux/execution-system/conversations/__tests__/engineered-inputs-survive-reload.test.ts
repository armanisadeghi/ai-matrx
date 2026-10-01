/**
 * W-31 follow-up: a shortcut conversation reopened from history re-sent the
 * whole note because its "engineered inputs" stamp lived only in memory.
 * The stamp is saved as `metadata.engineered_inputs` and restored on load.
 */
import {
  ENGINEERED_INPUTS_METADATA_KEY,
  parsePersistedEngineeredInputs,
  parsePersistedSurfaceOwnsOutput,
} from "../surface-owns-output.persistence";

describe("engineered inputs survive a reload", () => {
  it("reads the saved stamp", () => {
    expect(parsePersistedEngineeredInputs({ [ENGINEERED_INPUTS_METADATA_KEY]: true })).toBe(true);
  });

  it("absent, malformed or a sibling flag is not the stamp", () => {
    expect(parsePersistedEngineeredInputs(null)).toBe(false);
    expect(parsePersistedEngineeredInputs({ engineered_inputs: "true" })).toBe(false);
    expect(parsePersistedEngineeredInputs({ surface_owns_output: true })).toBe(false);
    expect(parsePersistedSurfaceOwnsOutput({ engineered_inputs: true })).toBe(false);
  });
});
