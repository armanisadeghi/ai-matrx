import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../QuickChatSheet.tsx", import.meta.url);

test("Quick Chat adopts the handed-off agent and delegates its label to the canonical picker", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(
    source,
    /state\.conversations\.byConversationId\[initialConversationId\]\?\.agentId/,
    "a handoff must read the agent already bound to its conversation",
  );
  assert.match(
    source,
    /initialAgentId=\{handedOffAgentId \|\| mandate\.agentId\}/,
    "the generic Quick Chat mandate may only be the fresh-panel fallback",
  );
  assert.match(
    source,
    /initialConversationId && !handedOffAgentId/,
    "a handoff must wait for the conversation shell instead of launching the wrong agent",
  );
  assert.match(
    source,
    /<AgentListDropdown[\s\S]*?activeAgentId=\{agentId\}/,
    "the picker must receive the selected agent so the choice visibly registers",
  );
  assert.doesNotMatch(
    source,
    /label=\{/,
    "the host must not override the canonical picker's active-agent label",
  );
});
