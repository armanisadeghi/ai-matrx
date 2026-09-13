// components/official/composer/__tests__/composer-submit.test.ts
//
// THE ONE COMPOSER RULE, guarded — plus the census that proves every composer
// in the product actually asks it instead of writing its own.

import fs from "node:fs";
import path from "node:path";

import {
  composerHintText,
  composerKeyIntent,
  intentTakesTheKey,
  type ComposerKeyEvent,
} from "../composerSubmit";

const key = (over: Partial<ComposerKeyEvent> = {}): ComposerKeyEvent => ({
  key: "Enter",
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  ...over,
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

describe("composerHintText — one wording, never invented per screen", () => {
  it("names the key that sends, both ways round", () => {
    expect(composerHintText(true)).toContain("Enter to send");
    expect(composerHintText(true)).toContain("Shift+Enter");
    expect(composerHintText(false)).toContain("Enter for a new line");
  });
});

// ── THE CENSUS GUARD ───────────────────────────────────────────────────────
// A shared primitive that half the composers ignore is not a primitive. These
// files are the message composers found in the 2026-09-12 census; each one
// must ask `composerKeyIntent` rather than testing `e.key === "Enter"` itself.
const REPO = path.resolve(__dirname, "../../../..");

const COMPOSERS = [
  "features/agents/components/inputs/smart-input/AgentTextarea.tsx",
  "features/agents/components/chat/NewChatLandingInput.tsx",
  "features/agents/components/agent-widgets/chat-assistant/CompactAssistantInput.tsx",
  "features/cx-chat/components/user-input/ConversationInput.tsx",
  "features/cx-conversation/ConversationInput.tsx",
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
