/**
 * EVERY HOST THAT REOPENS A CONVERSATION REJOINS WHAT IS STILL RUNNING.
 *
 * Break this guards (2026-10-03 23:05Z, agent run page): the person sent a
 * request on /agents/<id>/run and reloaded two seconds in. The run page's own
 * cold load built the instance and called `loadConversation` — and stopped.
 * The server writes a turn's rows when the turn settles, so that read found
 * nothing new; nobody asked /runtime whether the turn was still running and
 * nobody refetched when it finished. The page showed an empty turn until the
 * person navigated there again minutes later. /chat rejoined, because its
 * door (`useConversationResume`) runs `followWhatIsStillInFlight` after the
 * load; the run page, two history windows, the code editor, the tutor, the
 * war room, the studio assistant, the classic chat bootstraps and every
 * comparison mode each hand-rolled the load and skipped the follow.
 *
 * The census: a file that builds an instance (`createManualInstance(`) and
 * reads the conversation (`loadConversation(`) is reopening one, so it must
 * also go through a rejoin door. A new host that copies the load alone turns
 * this red.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(__dirname, "../../../../../..");

/** The doors that follow what is still in flight after a reopen. */
const REJOIN_DOOR =
  /\b(followWhatIsStillInFlight|rereadAndFollow|useConversationResume|resumeConversation|reconnectServerOperation)\(/;

function reopenHosts(): string[] {
  const files = execSync(
    "git grep -l 'loadConversation(' -- 'app/**/*.ts' 'app/**/*.tsx' 'features/**/*.ts' 'features/**/*.tsx' 'packages/chat/src/**/*.ts' 'packages/chat/src/**/*.tsx'",
    { cwd: root, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .filter((file) => !/__tests__\/|\.test\.tsx?$/.test(file));
  return files.filter((file) =>
    /\bcreateManualInstance\(/.test(readFileSync(path.join(root, file), "utf8")),
  );
}

describe("every conversation reopen host rejoins the live turn", () => {
  const hosts = reopenHosts();

  it("finds the hosts (the census is not vacuous)", () => {
    expect(hosts).toEqual(
      expect.arrayContaining([
        "packages/chat/src/agents/components/run/AgentRunnerPage.tsx",
        "packages/chat/src/agents/hooks/useConversationResume.ts",
        "packages/chat/src/window-panels/windows/agents/AgentRunHistoryWindow.tsx",
      ]),
    );
  });

  it("the agent run page follows after its cold load", () => {
    const source = readFileSync(
      path.join(root, "packages/chat/src/agents/components/run/AgentRunnerPage.tsx"),
      "utf8",
    );
    expect(source).toMatch(/\bfollowWhatIsStillInFlight\(dispatch, conversationIdFromUrl\)/);
  });

  it("every host goes through a rejoin door", () => {
    const missing = hosts.filter(
      (file) => !REJOIN_DOOR.test(readFileSync(path.join(root, file), "utf8")),
    );
    expect(missing).toEqual([]);
  });
});
