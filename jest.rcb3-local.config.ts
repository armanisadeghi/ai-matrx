import base from "./jest.config.ts";
// Temporary (never committed): judge a local candidate build of @ai-matrx/content-ir.
const mapper = (base as { moduleNameMapper?: Record<string, string> }).moduleNameMapper ?? {};
export default {
  ...base,
  moduleNameMapper: {
    ...mapper,
    "^@ai-matrx/content-ir/source$": "/Users/armanisadeghi/code/aidream/apps/shared/content-ir-core/dist/source.cjs",
  },
};
