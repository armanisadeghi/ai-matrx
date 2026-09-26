/**
 * Message flags — the builder half (typed-messages FEATURE.md, Flag row).
 *
 * Real use: a "Support reply drafter" whose system prompt is cached, whose two
 * sample exchanges are few-shot examples, and whose reply starts "Dear". The
 * toggles must say honestly what each flag does on the selected model, the
 * example pair must toggle together, and the preview must price the cache.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip">{children}</div>
  ),
}));

import { MessageFlagToggles } from "../MessageFlagToggles";
import { MessageFlagsPreview } from "../MessageFlagsPreview";
import {
  cacheBoundaryVerdict,
  exampleRuns,
  flagPlacementProblems,
  flagPreview,
  flagsShapeProblem,
  prefillVerdict,
  toggleMessageFlag,
  type MessageFlagProfile,
} from "../flags";
import { readPrefillRecord, prefillSentence } from "../PrefillNote";
import type { AIModelRecord } from "@/features/ai-models/redux/modelRegistrySlice";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function model(name: string, commonName: string, features: string[]): AIModelRecord {
  return {
    id: `id-${name}`,
    name,
    common_name: commonName,
    capabilities: { input: ["text"], output: ["text"], features, interaction: "turn" },
  } as unknown as AIModelRecord;
}

const sonnet5 = model("claude-sonnet-5", "Claude Sonnet 5", ["thinking", "prompt_caching"]);
const haiku45 = model("claude-haiku-4-5-20251001", "Claude Haiku 4.5", ["thinking", "assistant_prefill"]);

const anthropicProfile: MessageFlagProfile = {
  model_id: "id-claude-sonnet-5",
  wire_format: "anthropic_chat",
  input_price: 2,
  cached_input_price: 0.2,
  cache_write_5m_price: 2.5,
};

const text = (t: string) => [{ type: "text" as const, text: t }];
const LONG = "Northwind Outfitters support guidelines. ".repeat(160);

function drafter() {
  return [
    { role: "system", content: text(LONG), flags: { cache_boundary: true as const } },
    { role: "user", content: text("My tent pole snapped on the first night.") },
    { role: "assistant", content: text("Dear Jordan, I'm sorry your tent pole failed...") },
    { role: "user", content: text("{{customer_message}} Tone: {{tone}}") },
    { role: "assistant", content: text("Dear"), flags: { prefill: true as const } },
  ];
}

describe("flag rules", () => {
  it("flags an example pair together, and unflags it together", () => {
    const on = toggleMessageFlag(drafter(), 1, "example");
    expect(on[1].flags).toEqual({ example: true });
    expect(on[2].flags).toEqual({ example: true });
    const off = toggleMessageFlag(on, 2, "example");
    expect(off[1].flags).toBeUndefined();
    expect(off[2].flags).toBeUndefined();
  });

  it("keeps other flags when toggling one", () => {
    const next = toggleMessageFlag(drafter(), 0, "example");
    expect(next[0].flags).toEqual({ cache_boundary: true, example: true });
  });

  it("names a prefill that is no longer last", () => {
    const moved = [...drafter(), { role: "user", content: text("Please keep it short.") }];
    expect(flagPlacementProblems(moved)).toEqual([
      "Message 5: A prefill must be the last message — the reply continues from it.",
    ]);
    expect(flagPlacementProblems(drafter())).toEqual([]);
  });

  it("rejects an unknown flag shape", () => {
    expect(flagsShapeProblem({ prefil: true })).toBe('unknown message flag "prefil"');
    expect(flagsShapeProblem({ example: "yes" })).toBe('flag "example" must be true or false');
    expect(flagsShapeProblem(undefined)).toBeNull();
  });

  it("finds example runs", () => {
    const flagged = toggleMessageFlag(drafter(), 1, "example");
    expect(exampleRuns(flagged)).toEqual([[1, 2]]);
  });
});

describe("compatibility is never silent", () => {
  it("refuses prefill on Sonnet 5 by name, converts under the convert knob, works on Haiku", () => {
    const refused = prefillVerdict(sonnet5, "refuse");
    expect(refused.verdict).toBe("refused");
    expect(refused.reason).toContain("Claude Sonnet 5 cannot continue a reply from a prefill");
    expect(prefillVerdict(sonnet5, "convert").reason).toContain("asked for, not forced");
    expect(prefillVerdict(haiku45, "refuse").verdict).toBe("native");
  });

  it("says a cache boundary is a no-op on OpenAI and Gemini routes", () => {
    expect(cacheBoundaryVerdict(sonnet5, anthropicProfile).verdict).toBe("native");
    const openai = cacheBoundaryVerdict(sonnet5, { ...anthropicProfile, wire_format: "openai_chat" });
    expect(openai.verdict).toBe("noop");
    expect(openai.reason).toContain("automatically");
    expect(cacheBoundaryVerdict(sonnet5, { ...anthropicProfile, wire_format: "google_chat" }).reason).toContain(
      "implicitly",
    );
  });
});

describe("the request preview", () => {
  it("prices the cached prefix from catalog prices and counts example tokens", () => {
    const flagged = toggleMessageFlag(drafter(), 1, "example");
    const preview = flagPreview(flagged, anthropicProfile);
    expect(preview.cachedPrefixTokens).toBeGreaterThan(1024);
    expect(preview.examplePairs).toBe(1);
    expect(preview.exampleTokens).toBeGreaterThan(0);
    expect(preview.cachedInputCost).toBeLessThan(preview.fullInputCost as number);
    // cached reads at 10% of input: the saving approaches 90% as the prefix dominates
    expect(preview.savingsPercent).toBeGreaterThan(80);
    expect(preview.belowCacheMinimum).toBe(false);
  });

  it("shows no saving on a route that caches automatically", () => {
    const preview = flagPreview(drafter(), { ...anthropicProfile, wire_format: "openai_chat" });
    expect(preview.savingsPercent).toBeNull();
  });

  it("does not price a cached read when the prefix is below Anthropic's minimum", () => {
    const preview = flagPreview(
      [{ role: "system", content: text("Short policy"), flags: { cache_boundary: true } }],
      anthropicProfile,
    );
    expect(preview.belowCacheMinimum).toBe(true);
    expect(preview.cachedInputCost).toBeNull();
    expect(preview.savingsPercent).toBeNull();
    expect(renderToStaticMarkup(<MessageFlagsPreview preview={preview} profile={anthropicProfile} />))
      .not.toContain("Repeat run input");
  });

  it("does not call an uncached route an automatic cache", () => {
    const profile = { ...anthropicProfile, wire_format: "other_chat" };
    const markup = renderToStaticMarkup(
      <MessageFlagsPreview preview={flagPreview(drafter(), profile)} profile={profile} />,
    );
    expect(markup).toContain("This route has no prompt caching");
    expect(markup).not.toContain("caches automatically");
  });
});

describe("the runner's prefill line", () => {
  it("reads the server's record and says what happened", () => {
    const rec = readPrefillRecord({ prefill: { mode: "convert", text: "Dear", forced: false, starts_with_prefill: true } });
    expect(rec).not.toBeNull();
    expect(prefillSentence(rec!)).toBe("Asked to start with “Dear”, not forced — it did.");
    expect(readPrefillRecord({ prefill: { mode: "sideways", text: "x" } })).toBeNull();
  });
});

describe("MessageFlagToggles", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders each toggle with its state and reason, hides an absent one, and toggles on click", () => {
    const onToggle = jest.fn();
    act(() =>
      root.render(
        <MessageFlagToggles
          flags={{ prefill: true }}
          onToggle={onToggle}
          states={{
            prefill: { verdict: prefillVerdict(sonnet5, "refuse") },
            cache_boundary: { verdict: cacheBoundaryVerdict(sonnet5, anthropicProfile) },
            example: { hidden: true, verdict: { verdict: "native", reason: "" } },
          }}
        />,
      ),
    );
    const prefill = container.querySelector('[data-testid="message-flag-prefill"]') as HTMLButtonElement;
    const cache = container.querySelector('[data-testid="message-flag-cache_boundary"]') as HTMLButtonElement;
    expect(container.querySelector('[data-testid="message-flag-example"]')).toBeNull();
    expect(prefill.getAttribute("aria-pressed")).toBe("true");
    expect(prefill.dataset.verdict).toBe("refused");
    // a set flag the model refuses is amber, never quietly "on"
    expect(prefill.className).toContain("text-amber-700");
    expect(cache.getAttribute("aria-pressed")).toBe("false");
    expect(container.textContent).toContain("Claude Sonnet 5 cannot continue a reply from a prefill");
    act(() => cache.click());
    expect(onToggle).toHaveBeenCalledWith("cache_boundary");
  });
});

import {
  buildDisplayEntries,
  groupDisplayEntries,
} from "@/features/agents/components/messages-display/display-groups";
import type { MessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";

function rec(id: string, role: MessageRecord["role"], position: number, metadata: Record<string, unknown> = {}): MessageRecord {
  return {
    id,
    conversationId: "c",
    agentId: null,
    role,
    content: [{ type: "text", content: id }],
    contentHistory: null,
    userContent: null,
    position,
    source: "test",
    status: "active",
    isVisibleToModel: true,
    isVisibleToUser: true,
    metadata,
    createdAt: `2026-09-22T00:00:0${position}.000Z`,
    deletedAt: null,
    _clientStatus: "complete",
  } as MessageRecord;
}

describe("runner transcript", () => {
  it("collapses an example run into one group and never shows a consumed prefill as a turn", () => {
    const records = [
      rec("ex-u", "user", 0, { flags: { example: true } }),
      rec("ex-a", "assistant", 1, { flags: { example: true } }),
      rec("real-u", "user", 2),
      rec("prefill", "assistant", 3, { flags: { prefill: true } }),
      rec("reply", "assistant", 4, { prefill: { mode: "native", text: "Dear" } }),
    ];
    const grouped = groupDisplayEntries(
      buildDisplayEntries({ messages: records, isActive: false, latestRequestId: null, isErrorPhase: false }),
    );
    expect(grouped.map((g) => g.kind)).toEqual(["examples", "user", "assistant"]);
    const examples = grouped[0];
    expect(examples.kind === "examples" && examples.members.map((m) => m.messageId)).toEqual(["ex-u", "ex-a"]);
    const reply = grouped[2];
    expect(reply.kind === "assistant" && reply.members.map((m) => m.messageId)).toEqual(["reply"]);
  });
});
