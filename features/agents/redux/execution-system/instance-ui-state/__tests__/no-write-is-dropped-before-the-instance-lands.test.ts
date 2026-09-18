/**
 * D326 — A REDUCER THAT CANNOT APPLY A WRITE MUST NEVER SWALLOW IT.
 *
 * Every setter in `instance-ui-state.slice.ts` used to be
 * `const entry = state.byConversationId[id]; if (entry) { … }`. A launcher
 * hands a surface its `conversationId` BEFORE `createInstanceFull` writes that
 * row, which is exactly when a mount-once effect fires — so the write was
 * discarded, nothing was logged, and the calling code read as though it had
 * taken effect.
 *
 * Live cost (2026-09-16): the Masterwork interview's "Your interviewer" hero
 * and the Conductor's "who is in the room" introduction were both no-ops
 * whenever the instance row landed late, leaving an Expert who had just pressed
 * "Start the interview" staring at the generic "Ready to run" console and
 * "Fill in any variables below" — on a panel that deliberately shows no
 * variables at all.
 *
 * Two guards here, and both must fail against the old slice:
 *   1. BEHAVIOUR — write before the row, create the row, the write is still
 *      there (and the staging was announced).
 *   2. CENSUS — no setter in the file may go back to the drop pattern.
 *
 * ── AND THE STAGING IS NEVER SCREAMED ABOUT (cold-walk-6 finding 8,
 * 2026-09-17) ───────────────────────────────────────────────────────────────
 * The staging path shipped announcing itself with `console.error`, which raises
 * the Next.js dev error overlay: the Masterwork interview and Conductor rooms
 * both carried a red "1 Issue" chip on the first screen a first-time Expert
 * sees, for a write that had been kept and correctly applied.
 *
 * There is no ordering here for a surface to get right. `useAgentLauncher`
 * mints the conversation id synchronously DURING RENDER and hands it down from
 * the first paint on purpose, while `createInstanceFull` lands inside an async
 * thunk dispatched from the launcher's own effect — so a child's mount effect
 * always runs first. Staging is the designed write path, not a recovery, and an
 * error-level scream on a designed path with no remedy in it is its own defect:
 * it teaches every agent and every human in this checkout that the overlay is
 * noise, which is exactly when a real one stops being read.
 *
 * So the third guard: the whole staged-then-landed sequence raises NOTHING at
 * error or warn level, while still being announced (debug) — absent or honest,
 * never silent and never a false alarm.
 */

import instanceUIStateReducer, {
  initInstanceUIState,
  setDisplayDescriptionOverride,
  setDisplayIconNameOverride,
  setDisplayNameOverride,
  setInputPlaceholder,
  setShowMicrophone,
  toggleExpanded,
  updateModeState,
} from "../instance-ui-state.slice";
import { createInstanceFull } from "../../create-instance-full";
import { destroyInstance } from "../../conversations/conversations.slice";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONVERSATION = "conv-late-instance";

type UIState = ReturnType<typeof instanceUIStateReducer>;

const empty = (): UIState =>
  instanceUIStateReducer(undefined, { type: "@@init" });

const apply = (state: UIState, ...actions: { type: string }[]): UIState =>
  actions.reduce((acc, action) => instanceUIStateReducer(acc, action), state);

/** The launcher's own creation action, as `launchAgentExecution` emits it. */
const creation = (uiState?: Record<string, unknown>) =>
  createInstanceFull({
    conversationId: CONVERSATION,
    agentId: "agent-late-instance",
    agentType: "standard",
    origin: "manual",
    ...(uiState ? { uiState } : {}),
  } as unknown as Parameters<typeof createInstanceFull>[0]);

describe("a display write made before the instance row exists is never dropped", () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it("keeps the interview hero's three overrides across the instance landing", () => {
    const start = empty();
    expect(start.byConversationId[CONVERSATION]).toBeUndefined();

    // The panel mounts against a conversation id whose row has not landed.
    const staged = apply(
      start,
      setDisplayNameOverride({
        conversationId: CONVERSATION,
        value: "Your interviewer",
      }),
      setDisplayDescriptionOverride({
        conversationId: CONVERSATION,
        value: "Start anywhere — I ask from there.",
      }),
      setDisplayIconNameOverride({
        conversationId: CONVERSATION,
        value: "BrainCircuit",
      }),
    );

    // Visible immediately — the provisional entry is a COMPLETE entry.
    expect(staged.byConversationId[CONVERSATION]?.displayNameOverride).toBe(
      "Your interviewer",
    );
    // …and the staging is announced, never silent — but at debug level, since
    // it is the designed order and nothing failed.
    expect(debugSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    // The real creation lands a beat later and REPLACES the entry.
    const after = apply(staged, creation());
    const entry = after.byConversationId[CONVERSATION];

    expect(entry?.displayNameOverride).toBe("Your interviewer");
    expect(entry?.displayDescriptionOverride).toBe(
      "Start anywhere — I ask from there.",
    );
    expect(entry?.displayIconNameOverride).toBe("BrainCircuit");
    // The ledger is spent, not kept forever.
    expect(after.pendingByConversationId[CONVERSATION]).toBeUndefined();
  });

  it("lets the creation's own explicit value win over an earlier write", () => {
    const after = apply(
      empty(),
      setDisplayNameOverride({
        conversationId: CONVERSATION,
        value: "Your interviewer",
      }),
      creation({ displayNameOverride: "The Conductor" }),
    );

    expect(after.byConversationId[CONVERSATION]?.displayNameOverride).toBe(
      "The Conductor",
    );
  });

  it("keeps toggles, merges and plain fields written before the row lands", () => {
    const after = apply(
      empty(),
      toggleExpanded(CONVERSATION),
      setShowMicrophone({ conversationId: CONVERSATION, value: false }),
      setInputPlaceholder({
        conversationId: CONVERSATION,
        value: "Just start talking",
      }),
      updateModeState({
        conversationId: CONVERSATION,
        changes: { panelOpen: true },
      }),
      creation(),
    );
    const entry = after.byConversationId[CONVERSATION];

    // `isExpanded` defaults to true, so a toggle before the row flips it off
    // and stays off — same result as toggling after the row.
    expect(entry?.isExpanded).toBe(false);
    expect(entry?.showMicrophone).toBe(false);
    expect(entry?.inputPlaceholder).toBe("Just start talking");
    expect(entry?.modeState).toEqual({ panelOpen: true });
  });

  it("does not replay a staged write onto a later instance with the same id", () => {
    const after = apply(
      empty(),
      setDisplayNameOverride({
        conversationId: CONVERSATION,
        value: "Your interviewer",
      }),
      destroyInstance(CONVERSATION),
      creation(),
    );

    expect(
      after.byConversationId[CONVERSATION]?.displayNameOverride,
    ).toBeNull();
    expect(after.pendingByConversationId[CONVERSATION]).toBeUndefined();
  });

  it("applies a write normally once the row exists, with nothing announced", () => {
    const after = apply(
      empty(),
      initInstanceUIState({ conversationId: CONVERSATION }),
      setDisplayNameOverride({
        conversationId: CONVERSATION,
        value: "Your interviewer",
      }),
    );

    expect(after.byConversationId[CONVERSATION]?.displayNameOverride).toBe(
      "Your interviewer",
    );
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("the designed staging order raises no error and no warning", () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });

  /**
   * The exact sequence the Masterwork interview panel performs on mount, and
   * the one the cold walk caught raising a red "1 Issue" chip: three display
   * overrides against a conversation id the launcher minted during render,
   * then the launcher's async creation landing a beat later.
   */
  it("stages the interview hero's overrides and lands the instance in silence", () => {
    const after = apply(
      empty(),
      setDisplayNameOverride({
        conversationId: CONVERSATION,
        value: "Your interviewer",
      }),
      setDisplayDescriptionOverride({
        conversationId: CONVERSATION,
        value: "Start anywhere — I ask from there.",
      }),
      setDisplayIconNameOverride({
        conversationId: CONVERSATION,
        value: "BrainCircuit",
      }),
      creation(),
    );

    // The outcome is right …
    expect(after.byConversationId[CONVERSATION]?.displayNameOverride).toBe(
      "Your interviewer",
    );

    // … and NOTHING on that path was raised as a fault. `console.error` is what
    // Next.js counts into the dev error overlay, so this assertion is the chip.
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    // Not silent, either: both halves of the sequence announced themselves.
    expect(debugSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(String(debugSpy.mock.calls[0][0])).toContain("[instance-ui-state]");
  });

  it("keeps the Conductor room's mount order quiet too", () => {
    const CONDUCTOR = "conv-conductor-room";
    apply(
      empty(),
      setDisplayNameOverride({
        conversationId: CONDUCTOR,
        value: "Let's build your Masterwork",
      }),
      createInstanceFull({
        conversationId: CONDUCTOR,
        agentId: "agent-conductor",
        agentType: "standard",
        origin: "manual",
      } as unknown as Parameters<typeof createInstanceFull>[0]),
    );

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("has no console.error left on the staging path in the slice", () => {
    const source = readFileSync(
      join(__dirname, "..", "instance-ui-state.slice.ts"),
      "utf8",
    );
    // The comments name `console.error` on purpose — judge the CODE.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

    expect(code.match(/console\.error\(/g) ?? []).toEqual([]);
    // And the staging path still says something.
    expect((code.match(/console\.debug\(/g) ?? []).length).toBeGreaterThan(0);
  });
});

describe("the census — no setter may return to the drop pattern", () => {
  it("has no `if (entry)` guard left in the slice", () => {
    const source = readFileSync(
      join(__dirname, "..", "instance-ui-state.slice.ts"),
      "utf8",
    );
    // Comments describe the old pattern on purpose — judge the CODE.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

    expect(code.match(/if\s*\(\s*entry\s*\)/g) ?? []).toEqual([]);

    // And no setter reads the map off the payload to decide whether to write.
    expect(
      code.match(/=\s*state\.byConversationId\[action\.payload/g) ?? [],
    ).toEqual([]);

    // Positive half: the write path is used, by every setter that has one.
    expect((code.match(/stageOrApply\(/g) ?? []).length).toBeGreaterThan(40);
  });
});
