/**
 * THE COMPOSER'S RAIL IS ABOUT THIS CONVERSATION — NOTHING ACCOUNT-WIDE (2026-09-15).
 *
 * THE LIVE DEFECT (census W1). A subject-matter expert opened a vision
 * interview and found three chips pinned above the message box where she was
 * describing her vision: "Reducto Public Documentation", "Kestra Public
 * Documentation", "Firecrawl Documentation", "More". None of them had anything
 * to do with her session, or with that feature, or with anything she had ever
 * opened. They were her ACCOUNT's live integrations, rotated at random by
 * `ChatConnectorStrip`, which `ChatConnectionsStrip` fell back to whenever a
 * conversation had no MCP servers wired — and the vision interview's room
 * voices carry none, so that room took the fallback branch every single time.
 *
 * `ChatConnectionsStrip` is mounted by `SmartAgentInput` under EVERY composer on
 * the platform, so this was never one feature's bug: every embedded chat surface
 * with no tools wired wore another feature's connectors.
 *
 * THE RULE THIS FILE HOLDS: the rail under a composer reports what THIS
 * conversation is wired to, or says plainly that it is wired to nothing. An
 * account-wide, user-wide or randomized source must never appear there again.
 * The suggestion strip is not wrong — it keeps its own homes (the `/chat/new`
 * greeting and the live-integrations window); it is simply not about this
 * conversation.
 *
 * WHY A SOURCE CENSUS RATHER THAN A RENDER TEST: the defect was a fallback
 * branch reached only when a live query came back empty, and a render test
 * that mocked that query would prove only that the mock works. The import is
 * the thing that cannot be there. Restore the `ChatConnectorStrip` import in
 * ChatConnectionsStrip.tsx and this fails on the next run.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const HERE = path.join(__dirname, "..");

/** Components mounted under a composer by `SmartAgentInput`. */
const COMPOSER_RAILS = [
  "ChatConnectionsStrip.tsx",
  "SmartAgentInput.tsx",
] as const;

/**
 * Sources that answer for the ACCOUNT, not for the conversation. Each one is a
 * real component that belongs somewhere else on the platform.
 */
const ACCOUNT_WIDE_SOURCES = [
  "ChatConnectorStrip",
  "features/connectors/ChatConnectorStrip",
] as const;

describe("the rail under a composer is scoped to its conversation", () => {
  it.each(COMPOSER_RAILS)("%s pulls from no account-wide source", (file) => {
    const source = readFileSync(path.join(HERE, file), "utf8");
    // Comments are where this rule is EXPLAINED, so judge code lines only —
    // otherwise the explanation of the defect would itself fail the test.
    const code = source
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        return !(t.startsWith("*") || t.startsWith("//") || t.startsWith("/*"));
      })
      .join("\n");
    for (const forbidden of ACCOUNT_WIDE_SOURCES) {
      expect(code).not.toContain(forbidden);
    }
  });

  it("ChatConnectionsStrip still says something when nothing is wired", () => {
    const source = readFileSync(path.join(HERE, "ChatConnectionsStrip.tsx"), "utf8");
    // Removing the account-wide fallback must not have left the empty case
    // silent: a rail that renders nothing is a rail that cannot be used to
    // attach the first tool. The component keeps a branch for zero connections.
    expect(source).toMatch(/connections\.length === 0/);
  });
});
