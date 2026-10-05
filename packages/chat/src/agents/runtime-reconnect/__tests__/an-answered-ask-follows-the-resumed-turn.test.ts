/**
 * AN ANSWERED ASK FOLLOWS THE TURN IT RESUMED — NEVER JUST RE-READS IT.
 *
 * Break this guards (bench 2026-10-01 16:44Z, conversation 7bde4d03-…): the
 * person answered the `ask_person` card in chat. The answer door ran the parked
 * turn forward on the server, which stopped again on `board_read` — a tool only
 * the open page can run. The card's `onAnswered` (AskPersonInline) only
 * re-read the conversation: nothing surfaced the pending client call and
 * nothing followed the still-running operation, so the work sat until the
 * person reloaded (the reload's cold-load path did both). Its sibling,
 * ParkedOnPersonCard, already re-read AND followed — two copies of one door
 * that had drifted.
 *
 * Two halves:
 *  1. the ONE door (`rereadAndFollow`) re-reads, then follows what is still in
 *     flight — driven for real with its two collaborators stubbed;
 *  2. every answer door that renders `ActionRequestInlineAnswer` goes through
 *     it and never calls `loadConversation(` on its own (a census, so a third
 *     door cannot drift the same way).
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const loadConversation = jest.fn((args: { conversationId: string }) => ({
  type: "load",
  args,
}));
jest.mock(
  "../../redux/execution-system/thunks/load-conversation.thunk",
  () => ({ loadConversation: (args: { conversationId: string }) => loadConversation(args) }),
);
const followWhatIsStillInFlight = jest.fn();
jest.mock("../follow-what-is-still-in-flight", () => ({
  ...jest.requireActual("../follow-what-is-still-in-flight"),
  followWhatIsStillInFlight: (...args: unknown[]) => followWhatIsStillInFlight(...args),
}));

import { rereadAndFollow } from "../reread-and-follow";

const CONVERSATION = "7bde4d03-0633-47b5-9bd5-301ad30161ed";

describe("rereadAndFollow — the one door after an answer", () => {
  beforeEach(() => {
    loadConversation.mockClear();
    followWhatIsStillInFlight.mockClear();
  });

  it("re-reads the conversation, then follows what is still in flight", async () => {
    const dispatch = jest.fn(() => ({ unwrap: () => Promise.resolve() }));
    await rereadAndFollow(dispatch as never, CONVERSATION, "test");
    expect(loadConversation).toHaveBeenCalledWith({ conversationId: CONVERSATION });
    expect(followWhatIsStillInFlight).toHaveBeenCalledWith(dispatch, CONVERSATION);
  });

  it("still follows when the re-read fails — the turn may be running", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const dispatch = jest.fn(() => ({ unwrap: () => Promise.reject(new Error("offline")) }));
    await rereadAndFollow(dispatch as never, CONVERSATION, "test");
    expect(followWhatIsStillInFlight).toHaveBeenCalledWith(dispatch, CONVERSATION);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("every answer door goes through the one door", () => {
  const root = path.resolve(__dirname, "../../../../../..");
  const doors = execSync(
    "git grep -l '<ActionRequestInlineAnswer' -- 'features/**/*.tsx' 'packages/chat/src/**/*.tsx' 'app/**/*.tsx'",
    { cwd: root, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .filter((file) => !file.endsWith("ActionRequestInlineAnswer.tsx"))
    // The /q/<token> link page has no conversation in this tab to follow.
    .filter((file) => !file.startsWith("app/(link)/"));

  it("finds the doors (the census is not vacuous)", () => {
    expect(doors).toEqual(
      expect.arrayContaining([
        "packages/chat/src/action-requests/components/ParkedOnPersonCard.tsx",
        "packages/chat/src/tool-call-visualization/renderers/ask-person/AskPersonInline.tsx",
      ]),
    );
  });

  it.each([
    "packages/chat/src/action-requests/components/ParkedOnPersonCard.tsx",
    "packages/chat/src/tool-call-visualization/renderers/ask-person/AskPersonInline.tsx",
  ])("%s re-reads only through rereadAndFollow", (file) => {
    const source = readFileSync(path.join(root, file), "utf8");
    expect(source).toMatch(/\brereadAndFollow\(/);
    expect(source).not.toMatch(/\bloadConversation\(/);
  });

  it("covers every door the census found", () => {
    for (const file of doors) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect({ file, ok: /\brereadAndFollow\(/.test(source) && !/\bloadConversation\(/.test(source) })
        .toEqual({ file, ok: true });
    }
  });
});
