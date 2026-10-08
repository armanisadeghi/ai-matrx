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

jest.mock("@ai-matrx/chat/store/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ chatHost: { preferences: { showCreatorPanel: creatorPanelOn } } }),
}));

import {
  TranscriptAudienceProvider,
  useMachineFramesVisible,
} from "@ai-matrx/chat/agents/components/shared/transcript-audience";
import { CHAT_SRC_REL } from "../../../../chat-source";

const REPO_ROOT = process.cwd();
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
 * The shared renderer used to mount four separately-named components
 * (InlineToolCard / InlineToolBatch / DbToolCard / DbToolBatch), one per
 * live-vs-persisted × card-vs-batch combination. It has since been
 * consolidated onto ONE component per shape — `ToolCard` and `ToolBatch`
 * (`components/mardown-display/chat-markdown/internal-handlers/ToolHandlers.tsx`)
 * — each still mounted from two call sites in `EnhancedChatMarkdown.tsx`: the
 * live `tool` / `tool_batch` slot branch and the persisted `db_tool` /
 * `db_tool_batch` segment branch. The four legacy names still exist as thin
 * back-compat wrappers around `ToolCard`/`ToolBatch` for the other surfaces
 * that render one source only, but the shared transcript renderer no longer
 * spells any of them — so a literal search for `<InlineToolCard>` etc. in
 * this file finds nothing and proves nothing.
 *
 * The guard now scans EVERY `<ToolCard` / `<ToolBatch` mount site in the
 * shared renderer (not just the first) and requires each to sit behind
 * `machineFramesVisible` — so a fifth mount added later with no gate still
 * fails here, and so does a future rename back to four distinct components
 * that forgets the gate on one of them.
 */
const MACHINE_FRAME_TAGS = ["ToolCard", "ToolBatch"];

describe("every machine frame in the shared transcript renderer is gated", () => {
  const source = read(
    `${CHAT_SRC_REL}/ui/markdown-stream/EnhancedChatMarkdown.tsx`,
  );

  const mountSites = (tag: string): number[] => {
    const sites: number[] = [];
    let from = 0;
    for (;;) {
      const at = source.indexOf(`<${tag}`, from);
      if (at === -1) break;
      sites.push(at);
      from = at + 1;
    }
    return sites;
  };

  it.each(MACHINE_FRAME_TAGS)("every <%s> mount is gated", (tag) => {
    const sites = mountSites(tag);
    expect(sites.length).toBeGreaterThan(0);
    for (const mountAt of sites) {
      // The gate lives in the same branch, immediately above the mount.
      const branch = source.slice(Math.max(0, mountAt - 700), mountAt);
      expect(branch).toContain("machineFramesVisible");
    }
  });

  it("mounts both the live and the persisted branch for a card and a batch", () => {
    // Pins the "one component, two call sites" shape itself so a collapse
    // back to a single call site (losing branch coverage) is visible here.
    expect(mountSites("ToolCard").length).toBeGreaterThanOrEqual(2);
    expect(mountSites("ToolBatch").length).toBeGreaterThanOrEqual(2);
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

describe("thinking is gated at the one block renderer", () => {
  it("BlockRenderer hands the audience answer to every reasoning dispatch", () => {
    // Walk 24, defect G: the Expert's "Thought process" read "retry add_rules
    // using the correct section keys". Every reasoning trace — live slot,
    // persisted segment, inline <reasoning> tags — renders through
    // BlockRenderer, so the gate lives there, once.
    const renderer = read(
      // Moved into @ai-matrx/rich-content; its source lives in the aidream checkout.
      "../aidream/apps/shared/rich-content/src/display/chat-markdown/block-registry/BlockRenderer.tsx",
    );
    expect(renderer).toContain("const machineFramesVisible = useMachineFramesVisible();");
    expect(renderer).toMatch(/hideToolResults,\s*machineFramesVisible,/);
    const dispatch = read(
      "../aidream/apps/shared/rich-content/src/display/chat-markdown/block-registry/block-dispatch.tsx",
    );
    expect(dispatch).toContain("if (ctx.machineFramesVisible === false) {");
    expect(dispatch).toContain(
      "if (ctx.hideReasoning || ctx.machineFramesVisible === false) return null;",
    );
  });
});

describe("the composer's raw context chips are gated too", () => {
  it("does not build a chip from a raw context key for an Expert", () => {
    const source = read(
      `${CHAT_SRC_REL}/agents/components/inputs/smart-input/ConversationContextRail.tsx`,
    );
    // The raw-entry branch names its chip through contextEntryLabel since lane HANDOVER
    // (2026-09-28); the gate this guards is unchanged — the branch still sits behind it.
    const fallbackAt = source.indexOf("const label = contextEntryLabel(e);");
    expect(fallbackAt).toBeGreaterThan(-1);
    const branch = source.slice(Math.max(0, fallbackAt - 900), fallbackAt);
    expect(branch).toContain("if (!machineFramesVisible) continue;");
  });

  it("the composer's context rules chip is gated at its one shown-rule", () => {
    // Cold walk 23, defect E: the interview composer showed "Rulebook 35"
    // (aria-label "Context: Rulebook") opening an Item · Include · Chars ·
    // Inline max table of Route Brief, Lane, Workspace state… — a developer
    // context table on an Expert's page. The chip (2026-09-30) was added
    // beside the gated pills without the gate. The gate lives in the ONE hook
    // every mount asks (`useConversationContextChipShown`), so the rail and
    // every other composer that mounts the chip inherit it.
    const source = read(
      `${CHAT_SRC_REL}/agents/components/inputs/smart-input/ConversationContextChip.tsx`,
    );
    const hookAt = source.indexOf(
      "export function useConversationContextChipShown(",
    );
    expect(hookAt).toBeGreaterThan(-1);
    const hookBody = source.slice(hookAt, source.indexOf("\n}\n", hookAt));
    expect(hookBody).toContain("useMachineFramesVisible()");
    expect(hookBody).toMatch(/if \(!machineFramesVisible\) return false;/);
  });

  it("every composer mounts the context rules chip only behind that hook", () => {
    // AiWorkComposer stopped mounting the chip (3724f26401) — only composers
    // that mount it are held to the gate.
    for (const path of [
      `${CHAT_SRC_REL}/agents/components/inputs/smart-input/ConversationContextRail.tsx`,
    ]) {
      const source = read(path);
      const mountAt = source.indexOf("<ConversationContextChip");
      expect(mountAt).toBeGreaterThan(-1);
      expect(source.slice(Math.max(0, mountAt - 400), mountAt)).toContain(
        "contextChipShown",
      );
      expect(source).toContain("useConversationContextChipShown(");
    }
  });
});

describe("a context snapshot is a builder's record, not the Expert's", () => {
  it("the CONTEXT chip strip on a user bubble is gated too", () => {
    // Found live on 2026-09-16 while verifying the fix: with every tool card
    // gone, the interview still showed "CONTEXT · Context Items (13)" above
    // each of the Expert's own messages. Same class, one bubble higher.
    const source = read(
      `${CHAT_SRC_REL}/agents/components/messages-display/user/AgentUserMessage.tsx`,
    );
    // Since the server receipt landed, the bubble shows the receipt when one
    // exists and the snapshot strip otherwise — both branches carry the gate.
    expect(source).toContain(
      "machineFramesVisible && contextSnapshot && contextSnapshot.length > 0 && (",
    );
    expect(source).toContain(
      "machineFramesVisible && contextReceipt && (contextReceipt.rows?.length ?? 0) > 0 ? (",
    );
  });

  it("the first-turn launch variables are gated too", () => {
    // Also found live on 2026-09-16: the Conductor's first bubble opened with
    // "Attachments: … Rulebook Document: # … Rulebook id: a84d1c5e-… Status:
    // draft · Version: 25", and the interview's with "Interview Probes:
    // story_time / Interview Context Mode: blank_slate" — the host's own
    // wiring, in the host's vocabulary, inside the Expert's message bubble.
    const source = read(
      `${CHAT_SRC_REL}/agents/components/messages-display/user/AgentUserMessage.tsx`,
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
