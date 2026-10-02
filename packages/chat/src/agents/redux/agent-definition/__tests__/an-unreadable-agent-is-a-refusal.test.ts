/**
 * AN UNREADABLE AGENT IS A REFUSAL, NEVER A QUIET SUCCESS (page-pass
 * 2026-09-27, /agent-apps/[id]/run).
 *
 * `agx_get_execution_minimal` answers `[]` — no error — when the caller cannot
 * read the agent (another organization's agent behind a shared, public app).
 * The thunk returned quietly, `isReady` stayed false forever, and the Fact
 * Checker's every Run said "still loading"; `useAgentApp` never reached its
 * public-app door because nothing rejected. Only the Supabase client is stubbed.
 */
const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { fetchAgentExecutionMinimal } from "../thunks";

it("rejects, and records the error, when the read returns no row", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  const actions: Array<{ type: string; payload?: unknown }> = [];
  const dispatch = jest.fn((a: { type: string; payload?: unknown }) => {
    actions.push(a);
    return a;
  });
  const getState = () => ({ agentDefinition: { agents: {} } }) as never;
  const result = await fetchAgentExecutionMinimal("agent-x")(dispatch as never, getState, undefined);
  expect(result.type).toBe("agentDefinition/fetchExecutionMinimal/rejected");
  expect(actions.some((a) => /setAgentError/i.test(a.type))).toBe(true);
});
