/**
 * THE MACHINE NEVER TALKS TO AN EXPERT — a forcing function.
 *
 * Cold walk, 2026-09-16: on the Rulebook interview, the dedicated /interview
 * page and the Conductor's "Build with me" thread, every single turn printed
 * the machine talking to itself in the middle of what is supposed to read as a
 * conversation with a person:
 *
 *   `content` `surface` `rulebook_id` `lane`  "···16"
 *   "Kind: rulebook_tool_result" · "Action: add_rules"
 *   "6 fields did not apply — show" · "+43 more fields"
 *   "Using tool rulebook" · "Workflow Catalog · 2 calls"
 *
 * An earlier reviewer logged it as "seen once and not reproduced on four later
 * runs". It reproduced on every turn on three surfaces, because the fix had
 * been made per-surface three times and the frames come from ONE shared
 * renderer serving two completely different readers.
 *
 * This suite holds the CLASS fix down, in the four places it can rot:
 *
 *   1. The primitive answers correctly — including the escape hatch, because a
 *      fix that also blinds admins would be traded back within a week.
 *   2. Every machine frame in the one shared transcript renderer is gated. A
 *      fifth frame added later without the gate fails here, which is the only
 *      thing that stops this from becoming a per-surface fix for the fourth
 *      time.
 *   3. The composer's raw ad-hoc context chips are gated — the leak was in the
 *      toolbar as much as the thread.
 *   4. The expert-facing hosts actually DECLARE themselves. A gate nobody
 *      turns on is not a fix.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// React 19 concurrent act support.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let creatorPanelOn = false;

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ creatorDebug: { showCreatorPanel: creatorPanelOn } }),
}));

import {
  TranscriptAudienceProvider,
  useMachineFramesVisible,
} from "../transcript-audience";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (relative: string) =>
  readFileSync(join(REPO_ROOT, relative), "utf8");

function Probe() {
  return <span>{useMachineFramesVisible() ? "shown" : "hidden"}</span>;
}

function renderProbe(audience: "builder" | "expert"): string {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root: Root | null = null;
  act(() => {
    root = createRoot(host);
    root.render(
      <TranscriptAudienceProvider audience={audience}>
        <Probe />
      </TranscriptAudienceProvider>,
    );
  });
  const text = host.textContent ?? "";
  act(() => root?.unmount());
  host.remove();
  return text;
}

afterEach(() => {
  creatorPanelOn = false;
});

describe("the audience primitive", () => {
  it("shows machine frames to a builder — every surface that declares nothing is unchanged", () => {
    expect(renderProbe("builder")).toBe("shown");
  });

  it("hides them from an Expert", () => {
    expect(renderProbe("expert")).toBe("hidden");
  });

  it("still shows them to an admin in creator mode, standing on the very same screen", () => {
    creatorPanelOn = true;
    expect(renderProbe("expert")).toBe("shown");
  });
});

/**
 * The four machine frames the one shared renderer can mount. Each must sit
 * behind the gate; the check reads the source because the failure this guards
 * is a FIFTH frame being added later with no gate — behaviour tests over the
 * four that exist today cannot see that.
 */
const MACHINE_FRAMES = [
  "InlineToolCard",
  "InlineToolBatch",
  "DbToolCard",
  "DbToolBatch",
];

describe("every machine frame in the shared transcript renderer is gated", () => {
  const source = read(
    "components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx",
  );

  it.each(MACHINE_FRAMES)("%s only mounts when machine frames are visible", (
    frame,
  ) => {
    const mountAt = source.indexOf(`<${frame}`);
    expect(mountAt).toBeGreaterThan(-1);
    // The gate lives in the same branch, immediately above the mount.
    const branch = source.slice(Math.max(0, mountAt - 700), mountAt);
    expect(branch).toContain("machineFramesVisible");
  });

  it("gives an Expert the FACT that work is happening, never silence", () => {
    // Nothing fails silently: a tool still in flight renders a plain-English
    // line. A fix that simply deleted the frames would pass the checks above
    // and leave a person staring at a dead screen.
    expect(source).toContain("EXPERT_WORKING_LABEL");
  });

  it("never lets a machine status label through verbatim to an Expert", () => {
    // The providers emit "Using tool <name>" as a user-facing status string
    // (aidream anthropic_api.py et al). The label is chosen by the gate.
    expect(source).toContain(
      "label={machineFramesVisible ? slot.label : EXPERT_WORKING_LABEL}",
    );
  });
});

describe("the composer's raw context chips are gated too", () => {
  it("does not build a chip from a raw context key for an Expert", () => {
    const source = read(
      "features/agents/components/inputs/smart-input/ConversationContextRail.tsx",
    );
    const fallbackAt = source.indexOf("const label = e.label?.trim() || e.key;");
    expect(fallbackAt).toBeGreaterThan(-1);
    const branch = source.slice(Math.max(0, fallbackAt - 900), fallbackAt);
    expect(branch).toContain("if (!machineFramesVisible) continue;");
  });
});

describe("a context snapshot is a builder's record, not the Expert's", () => {
  it("the CONTEXT chip strip on a user bubble is gated too", () => {
    // Found live on 2026-09-16 while verifying the fix: with every tool card
    // gone, the interview still showed "CONTEXT · Context Items (13)" above
    // each of the Expert's own messages. Same class, one bubble higher.
    const source = read(
      "features/agents/components/messages-display/user/AgentUserMessage.tsx",
    );
    expect(source).toContain(
      "{machineFramesVisible && contextSnapshot && contextSnapshot.length > 0 && (",
    );
  });

  it("the first-turn launch variables are gated too", () => {
    // Also found live on 2026-09-16: the Conductor's first bubble opened with
    // "Attachments: … Rulebook Document: # … Rulebook id: a84d1c5e-… Status:
    // draft · Version: 25", and the interview's with "Interview Probes:
    // story_time / Interview Context Mode: blank_slate" — the host's own
    // wiring, in the host's vocabulary, inside the Expert's message bubble.
    const source = read(
      "features/agents/components/messages-display/user/AgentUserMessage.tsx",
    );
    expect(source).toContain(
      "{machineFramesVisible && isFirstTurnMessage && (",
    );
  });
});

describe("the expert-facing hosts declare themselves", () => {
  // A gate nobody turns on is not a fix. These are the surfaces the cold walk
  // reproduced the leak on, all three of which mount the shared column.
  it.each([
    ["the Rulebook interview and /interview page", "features/masterwork/components/detail/ScoutInterviewPanel.tsx"],
    ["the Conductor", "features/masterwork/conduct/ConductorPanel.tsx"],
    ["the Vision Interview room", "features/vision-interview/components/RoomChatPane.tsx"],
  ])("%s declares an expert audience", (_name, path) => {
    expect(read(path)).toContain('audience="expert"');
  });
});
