// components/official/composer/__tests__/composer-submit.test.ts
//
// THE ONE COMPOSER RULE, guarded — plus the census that proves every composer
// in the product actually asks it instead of writing its own.

import fs from "node:fs";
import path from "node:path";

import {
  composerKeyIntent,
  enterSendsHere,
  intentTakesTheKey,
  type ComposerKeyEvent,
} from "@ai-matrx/kit/composer-keys";

const key = (over: Partial<ComposerKeyEvent> = {}): ComposerKeyEvent => ({
  key: "Enter",
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  ...over,
});

describe("a touch-only device — Enter is always a new line (Arman, 2026-09-28)", () => {
  it("never sends on a bare Enter from an on-screen keyboard, whatever the setting", () => {
    expect(composerKeyIntent(key(), { submitOnEnter: true, touchKeyboard: true })).toBe("newline");
    expect(composerKeyIntent(key(), { submitOnEnter: false, touchKeyboard: true })).toBe("newline");
    expect(enterSendsHere(true, true)).toBe(false);
  });

  it("keeps the setting on a device with a real keyboard", () => {
    expect(composerKeyIntent(key(), { submitOnEnter: true, touchKeyboard: false })).toBe("send");
    expect(enterSendsHere(true, false)).toBe(true);
  });
});

describe("composerKeyIntent — Enter sends, Shift+Enter is a new line", () => {
  it("sends on a bare Enter when the conversation submits on Enter", () => {
    expect(composerKeyIntent(key(), { submitOnEnter: true })).toBe("send");
  });

  it("makes a new line on Shift+Enter", () => {
    expect(composerKeyIntent(key({ shiftKey: true }), { submitOnEnter: true })).toBe(
      "newline",
    );
  });

  it("falls back to the modifier send when Enter is a new line", () => {
    expect(composerKeyIntent(key(), { submitOnEnter: false })).toBe("newline");
    expect(composerKeyIntent(key({ metaKey: true }), { submitOnEnter: false })).toBe(
      "send",
    );
    expect(composerKeyIntent(key({ ctrlKey: true }), { submitOnEnter: false })).toBe(
      "send",
    );
  });

  it("never claims a key that is not Enter", () => {
    expect(composerKeyIntent(key({ key: "a" }), { submitOnEnter: true })).toBe("none");
    expect(intentTakesTheKey("none")).toBe(false);
  });

  it("leaves Enter to an IME mid-composition", () => {
    expect(
      composerKeyIntent(key({ isComposing: true }), { submitOnEnter: true }),
    ).toBe("none");
  });

  it("offers steer and interrupt only while a run is streaming", () => {
    const running = { submitOnEnter: true, isRunning: true };
    expect(composerKeyIntent(key({ metaKey: true }), running)).toBe("steer");
    expect(
      composerKeyIntent(key({ metaKey: true, shiftKey: true }), running),
    ).toBe("interrupt");
    // Outside a run the interrupt combo is not a combo at all — Shift wins
    // and it is an ordinary new line, exactly as it was before this rule was
    // shared. Nothing gains a meaning it did not already have.
    expect(
      composerKeyIntent(key({ metaKey: true, shiftKey: true }), {
        submitOnEnter: true,
      }),
    ).toBe("newline");
  });

  it("only ever asks the composer to swallow the key when it did something", () => {
    for (const intent of ["send", "steer", "interrupt"] as const) {
      expect(intentTakesTheKey(intent)).toBe(true);
    }
    expect(intentTakesTheKey("newline")).toBe(false);
  });
});

// ── THE CENSUS GUARD ───────────────────────────────────────────────────────
// A shared primitive that half the composers ignore is not a primitive. These
// files are the message composers found in the 2026-09-12 census; each one
// must ask `composerKeyIntent` rather than testing `e.key === "Enter"` itself.
const REPO = path.resolve(__dirname, "../../../..");

const COMPOSERS = [
  "../aidream/apps/shared/chat/src/agents/components/inputs/smart-input/AgentTextarea.tsx",
  "../aidream/apps/shared/chat/src/agents/components/agent-widgets/chat-assistant/CompactAssistantInput.tsx",
  "../aidream/apps/shared/chat/src/cx-chat/components/user-input/ConversationInput.tsx",
  "../aidream/apps/shared/chat/src/cx-conversation/ConversationInput.tsx",
  "features/whatsapp-clone/chat-view/MessageInputBar.tsx",
  "components/official/ProTextarea.tsx",
];

describe("every composer shares the primitive", () => {
  it.each(COMPOSERS)("%s asks composerKeyIntent", (relative) => {
    const source = fs.readFileSync(path.join(REPO, relative), "utf8");
    expect(source).toContain("composerKeyIntent");
  });

  it.each(COMPOSERS)("%s writes no Enter rule of its own", (relative) => {
    const source = fs.readFileSync(path.join(REPO, relative), "utf8");
    // The one legitimate mention is the import/call of the shared rule; a
    // hand-rolled `e.key === "Enter" && !e.shiftKey` branch is the defect.
    expect(source).not.toMatch(/key\s*===\s*["']Enter["'][^\n]*shiftKey/);
  });
});

// ── THE TOUCH GUARD — every multi-line box, not only the census above ──────
// Arman, 2026-09-28: on a phone Enter must never send — its keyboard has one
// key for a new line. A file that renders a multi-line text box AND writes its
// own `Enter && !shiftKey` branch must route that branch through the shared
// rule (`enterSendsHere` / `composerKeyIntent`). Found on 2026-10-04: seven
// boxes (Ask Knowledge, Make › Describe, two flashcard chats, a debate demo,
// two sample apps) sent on a phone's Enter.
const MULTILINE_BOX = /<textarea\b|<Textarea\b|<BasicTextarea\b|<ProTextarea\b/;
const OWN_ENTER_RULE = /key\s*===\s*["']Enter["'][^\n]*shiftKey/;
const SHARED_RULE = /enterSendsHere|composerKeyIntent/;

/** Files whose Enter branch does NOT send a message — with the reason. */
const NOT_A_SEND: Record<string, string> = {
  "components/matrx/ConfigBuilder/index.tsx": "Enter moves focus to the next field; textareas keep their newline",
  "../aidream/apps/shared/chat/src/agents/components/inputs/variable-input-variations/AgentVariablesGuided.tsx": "Enter moves to the next variable, never sends",
  "features/podcasts/generator/components/CreateShowDialog.tsx": "the Enter branch is on a single-line <Input>",
  "features/tasks/widgets/AssociateTaskButton.tsx": "the Enter branch is on a single-line <Input>",
  "features/tasks/widgets/QuickCreateTaskButton.tsx": "the Enter branch is on a single-line <Input>",
  "features/tasks/widgets/TaskTapButton.tsx": "the Enter branch is on a single-line <Input>",
  "features/transcript-studio/components/columns/EditableConceptRow.tsx": "the Enter branch is on the single-line label <input>",
};

export function bypassesTouchRule(source: string): boolean {
  return MULTILINE_BOX.test(source) && OWN_ENTER_RULE.test(source) && !SHARED_RULE.test(source);
}

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".") || entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("THE TOUCH GUARD — no multi-line box sends on a phone's Enter", () => {
  it("the detector catches a hand-rolled send and passes the shared rule", () => {
    const bad = `<Textarea onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) send(); }} />`;
    const good = `<Textarea onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && enterSendsHere(true)) send(); }} />`;
    expect(bypassesTouchRule(bad)).toBe(true);
    expect(bypassesTouchRule(good)).toBe(false);
  });

  it("every multi-line box in the app uses the shared rule (or is a named non-send)", () => {
    const offenders = ["app", "features", "components", "packages", "lib"]
      .filter((dir) => fs.existsSync(path.join(REPO, dir)))
      .flatMap((dir) => tsxFiles(path.join(REPO, dir)))
      .map((file) => path.relative(REPO, file))
      .filter((relative) => !(relative in NOT_A_SEND))
      .filter((relative) => bypassesTouchRule(fs.readFileSync(path.join(REPO, relative), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("every named non-send still exists and still needs its exemption", () => {
    for (const relative of Object.keys(NOT_A_SEND)) {
      const full = path.join(REPO, relative);
      expect(fs.existsSync(full)).toBe(true);
      expect(OWN_ENTER_RULE.test(fs.readFileSync(full, "utf8"))).toBe(true);
    }
  });
});
