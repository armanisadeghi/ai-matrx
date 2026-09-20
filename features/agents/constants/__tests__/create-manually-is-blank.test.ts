/**
 * "Create Manually" must create a BLANK agent.
 *
 * The sixth independent verification pass of the unified-data store asked an
 * agent made this way to write twenty records and got a list of luxury shops
 * in Manhattan instead: the manual path handed over a shopping demo
 * (`TEMPLATE_DATA`), whose own user turn outranked the person's instruction.
 *
 * This asserts the seed carries nothing demonstrative AND that the two manual
 * entry points actually use it — a blank constant nobody reaches is not a fix.
 */
import fs from "node:fs";
import path from "node:path";

import {
  BLANK_AGENT_SEED,
  DEFAULT_AGENT_MODEL_ID,
} from "@/features/agents/constants/blank-agent";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

const MANUAL_ENTRY_POINTS = [
  "app/(core)/agents/new/manual/CreateManualAgentClient.tsx",
  "app/(admin)/administration/agents/system-agents/agents/new/manual/page.tsx",
];

/** The pin every creation path carried: `gemini-3-flash-preview`, deprecated. */
const RETIRED_DEMO_MODEL_ID = "e2150d2f-7dd3-4fad-9d81-6e6ea41d4afd";

function messageText(seed: typeof BLANK_AGENT_SEED): string {
  return (seed.messages ?? [])
    .flatMap((message) =>
      (message.content as unknown as { text?: string }[]).map(
        (block) => block.text ?? "",
      ),
    )
    .join("")
    .trim();
}

describe("the manual path gives a person a blank agent", () => {
  it("carries no sample instruction, user turn, or variables", () => {
    expect(messageText(BLANK_AGENT_SEED)).toBe("");
    expect(BLANK_AGENT_SEED.variableDefinitions).toEqual([]);
    expect(BLANK_AGENT_SEED.customTools).toEqual([]);
    expect(BLANK_AGENT_SEED.contextPolicies).toEqual([]);
    expect(BLANK_AGENT_SEED.mcpServers).toEqual([]);
    expect(BLANK_AGENT_SEED.name).not.toMatch(/template/i);
  });

  it("names no tool, so the organization's default set is what it gets", () => {
    // `agent.definition`'s `zz_seed_org_default_tools` seeds the organization's
    // tools (Records where the store is on) only when the writer sent none.
    expect(BLANK_AGENT_SEED.tools).toEqual([]);
  });

  it("starts on a capable model, not the deprecated demo pin", () => {
    expect(DEFAULT_AGENT_MODEL_ID).not.toBe(RETIRED_DEMO_MODEL_ID);
    expect(BLANK_AGENT_SEED.modelId).toBe(DEFAULT_AGENT_MODEL_ID);
  });

  it.each(MANUAL_ENTRY_POINTS)("%s creates the blank seed", (relative) => {
    const source = fs.readFileSync(path.join(REPO_ROOT, relative), "utf8");
    expect(source).toContain("BLANK_AGENT_SEED");
    expect(source).not.toContain("TEMPLATE_DATA");
  });
});
