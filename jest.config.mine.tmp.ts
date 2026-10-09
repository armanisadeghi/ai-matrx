import base from "./jest.config.ts";
const c: any = typeof base === "function" ? base : base;
export default (async () => {
  const cfg: any = typeof c === "function" ? await c() : c;
  return { ...cfg, moduleNameMapper: { "^@ai-matrx/records/search$": "/private/tmp/claude-501/-Users-armanisadeghi-code/b50d2611-0892-49de-8015-7536817dcea9/scratchpad/proxy-stub.js", "^@ai-matrx/chat/agents/redux/execution-system/thunks/post-delegated-tool-outcome$": "/private/tmp/claude-501/-Users-armanisadeghi-code/b50d2611-0892-49de-8015-7536817dcea9/scratchpad/pdto-stub.js", ...cfg.moduleNameMapper } };
})();
