/**
 * The ONE door from package code to the host's model registry (`state.modelRegistry`).
 *
 * The `modelRegistry` slice still lives in the app (`features/ai-models/redux`); P17b makes it a
 * package-owned slice under the same key. Until then package files import the registry here, so
 * the tie is one line and P17b repoints one file.
 */
export {
  default as modelRegistryReducer,
  classConfigKey,
  selectModelById,
  type AIModel,
  type AIModelRecord,
} from "@host/features/ai-models/redux/modelRegistrySlice";
