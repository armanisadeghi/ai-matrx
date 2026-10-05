/**
 * The composer's picked shapes travel as `output_kinds` on EVERY request —
 * start and continue — and an empty pick is sent as `[]` (the server reads an
 * omitted field as "use the chat's saved picks", `[]` as "explicitly none").
 */

import { attachOutputKindsFromState } from "../build-skill-config-for-request";
import { buildContinuationBody } from "../continuation-body";
import type { AssembledAgentStartRequest } from "../../../../types/request.types";
import type { components } from "@ai-matrx/agents/generated/api-types";
import type { ChatRootState } from "../../../../../store/root-state";

const CONV = "c027c75d-4b45-4b57-b830-75a72d90ca58";

const stateWith = (outputKinds?: string[]) =>
  ({
    instanceUIState: {
      byConversationId: { [CONV]: { builderAdvancedSettings: { outputKinds } } },
    },
  }) as unknown as ChatRootState;

const OPTS = { retry: false, debug: false, cacheBypass: null };

it("attaches the picked kinds, de-duplicated, in pick order", () => {
  const payload: { output_kinds?: string[] | null } = {};
  attachOutputKindsFromState(stateWith(["quiz_set", "timeline", "quiz_set"]), CONV, payload);
  expect(payload.output_kinds).toEqual(["quiz_set", "timeline"]);
});

it("attaches [] (not nothing) when no shape is picked", () => {
  const none: { output_kinds?: string[] | null } = {};
  attachOutputKindsFromState(stateWith(undefined), CONV, none);
  expect(none.output_kinds).toEqual([]);
});

it("a continuation turn forwards output_kinds, including the explicit empty list", () => {
  const picked = buildContinuationBody(
    { user_input: "go", output_kinds: ["quiz_set"] } as unknown as AssembledAgentStartRequest,
    OPTS,
  );
  expect(picked.output_kinds).toEqual(["quiz_set"]);
  const none = buildContinuationBody(
    { user_input: "go", output_kinds: [] } as unknown as AssembledAgentStartRequest,
    OPTS,
  );
  expect(none.output_kinds).toEqual([]);
});

it("the generated start, chat and continue request types carry output_kinds (typed, no casts)", () => {
  // If @ai-matrx/agents drops the field, these stop compiling (weak-type check
  // on an all-optional target) — the test cannot pass against stale types.
  const start: Partial<components["schemas"]["AgentStartRequest"]> = {};
  const chat: Partial<components["schemas"]["ChatRequest"]> = {};
  const cont: Partial<components["schemas"]["ConversationContinueRequest"]> = {};
  for (const request of [start, chat, cont]) {
    attachOutputKindsFromState(stateWith(["quiz_set"]), CONV, request);
    expect(request.output_kinds).toEqual(["quiz_set"]);
  }
});
