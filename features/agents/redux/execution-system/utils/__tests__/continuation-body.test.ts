/**
 * A continuation turn carries what the person set for THIS turn.
 *
 * Live 2026-10-01 (conversation c027c75d…): a skill added through Chat Options →
 * Skills before turn 2 never reached the server — the turn-2 request recorded
 * `skill_config.included: []` and the wire payload held no skill text — because
 * the continuation body was an inline whitelist without `skill_config`.
 */

import { attachSkillConfigFromState } from "../build-skill-config-for-request";
import {
  CONTINUATION_FIELD_ROUTING,
  buildContinuationBody,
} from "../continuation-body";
import type { AssembledAgentStartRequest } from "@/features/agents/types/request.types";
import type { RootState } from "@/lib/redux/store";

const CONV = "c027c75d-4b45-4b57-b830-75a72d90ca58";
const AGENT = "fb92012c-5efd-47eb-9763-de8ec7542ce9";
const SKILL = "502365e7-2bde-4e61-8de5-a6b3fa63b6b5";

function stateWithAddedSkill(): RootState {
  return {
    conversations: { byConversationId: { [CONV]: { agentId: AGENT } } },
    instanceUIState: {
      byConversationId: { [CONV]: { builderAdvancedSettings: { addedSkills: [SKILL] } } },
    },
    agentDefinition: { agents: {} },
  } as unknown as RootState;
}

describe("buildContinuationBody", () => {
  it("carries a skill added mid-conversation through Chat Options", () => {
    const payload: AssembledAgentStartRequest = {
      user_input: "You have it now, finish the routing line.",
      organization_id: "2c1d4319-bf0d-40bc-8ca1-657f4063d080",
    };
    // The real fold the thunk runs before routing.
    attachSkillConfigFromState(stateWithAddedSkill(), CONV, payload);
    expect(payload.skill_config).toBeDefined();

    const body = buildContinuationBody(payload, { retry: false, debug: false, cacheBypass: null });
    expect(body.skill_config).toEqual(
      expect.objectContaining({ included: [SKILL], disabled: false }),
    );
    expect(body.user_input).toBe(payload.user_input);
    expect(body.stream).toBe(true);
  });

  it("carries a type-only scope selection", () => {
    const body = buildContinuationBody(
      { user_input: "x", active_scope_type_ids: ["lanes"] } as AssembledAgentStartRequest,
      { retry: false, debug: false, cacheBypass: null },
    );
    expect(body.active_scope_type_ids).toEqual(["lanes"]);
  });

  it("forwards every field classified as forwarded, and nothing classified otherwise", () => {
    const payload: Record<string, unknown> = {};
    for (const key of Object.keys(CONTINUATION_FIELD_ROUTING)) payload[key] = [`v-${key}`];
    const body = buildContinuationBody(payload as AssembledAgentStartRequest, {
      retry: false,
      debug: false,
      cacheBypass: null,
    });
    for (const [key, route] of Object.entries(CONTINUATION_FIELD_ROUTING)) {
      if (route === true) expect(body[key]).toEqual([`v-${key}`]);
      else if (!["user_input", "stream"].includes(key)) expect(body[key]).toBeUndefined();
    }
  });

  it("keeps the old whitelist's emptiness rules", () => {
    const body = buildContinuationBody(
      {
        user_input: "x",
        scope_ids: [],
        tools: [],
        memory: false,
        tools_replace: false,
        block_mode: false,
        context_withheld: false,
      } as unknown as AssembledAgentStartRequest,
      { retry: true, debug: true, cacheBypass: { conversation: true } },
    );
    expect(body).toEqual({
      retry: true,
      stream: true,
      tools: [],
      memory: false,
      tools_replace: false,
      context_withheld: false,
      debug: true,
      cache_bypass: { conversation: true },
    });
  });
});
