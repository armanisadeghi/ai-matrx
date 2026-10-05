/**
 * The ONE door from package code to the host's model registry (`state.modelRegistry`).
 *
 * The `modelRegistry` slice is package-owned (agents/model-registry), mounted under the same key.
 */
export {
  default as modelRegistryReducer,
  classConfigKey,
  selectModelById,
  type AIModel,
  type AIModelRecord,
} from "../model-registry/modelRegistrySlice";
