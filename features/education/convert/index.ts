// features/education/convert/index.ts
//
// Public surface of the cross-tool content converter contract. Importing this
// module registers all generators (side effect) and exposes the dispatch.
//
//     import { convertContent } from "@/features/education/convert";
//     const result = await convertContent({ source, targetKind: "deck" }, ctx);
//
// In React, prefer `useContentConverter()` (it resolves dispatch/store/org for
// you). See FEATURE.md for the full contract.

import "./generators"; // side-effect: registers deck/summary/mind_map + placeholders

export { runConvert as convertContent } from "./registry";
export {
  getGenerator,
  isTargetAvailable,
  listGenerators,
  registerGenerator,
} from "./registry";
export type {
  TargetKind,
  ConvertSource,
  SourceRef,
  ConvertOptions,
  ConvertRequest,
  ConvertResult,
  ConvertContext,
  ConvertGenerator,
} from "./types";
export { ALL_TARGET_KINDS } from "./types";
export { useContentConverter } from "./useContentConverter";
