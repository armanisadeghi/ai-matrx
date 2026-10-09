/**
 * Where a person goes the moment the Agent Factory keeps their agent (owner, 2026-10-09;
 * REGISTER R58): the agent builder for the new agent, with the Side Chat open on a NEW
 * chat beside it. The Side Chat follows the builder's page surface
 * (`matrx-user/agent-builder`), so the helper sees the agent and — once the person runs
 * it in the builder's test panel — that run's variables, typed input, answer and
 * transcript. The person keeps talking: more information, questions, changes; changes
 * land in the builder (staged writes), never as a prompt one of our agents hand-wrote.
 *
 * The link uses the Side Chat's own link contract (`side_chat`, `side_chat_mode`,
 * `@ai-matrx/chat` canvas/workspace/side-chat-address.ts) — no new parameters.
 */

export const REFINE_SIDE_CHAT = { side_chat: "new", side_chat_mode: "chat" } as const;

export function refineAgentHref(agentId: string): string {
  return `/agents/${agentId}/build?${new URLSearchParams(REFINE_SIDE_CHAT).toString()}`;
}
