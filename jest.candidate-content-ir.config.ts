// TEMPORARY (RC-B10 stage b verification, never committed).
import base from "./jest.config.ts";
export default {
  ...base,
  moduleNameMapper: {
    ...(base.moduleNameMapper ?? {}),
    "^@ai-matrx/content-ir/source$": "/Users/armanisadeghi/code/aidream/apps/shared/content-ir-core/source.ts",
  },
};
