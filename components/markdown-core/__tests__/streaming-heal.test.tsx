/**
 * Streaming healing through the ONE markdown core.
 *
 * The break this guards (verify-RC-B1, 2026-09-23): mid-stream, half-arrived
 * links and images showed as raw text (`![Minion](https://octo`,
 * `[Footnotes](https://github.com/mark`) and a half-arrived reference
 * definition (`[id]: https://octo`) turned `![alt][id]` into an <img> that
 * FETCHED the partial URL (404 / DNS errors). Remove the healing in the core
 * (or the streaming signal that switches it on) and this goes red.
 *
 * Seam: the real chat engine (EnhancedChatMarkdownInternal) receives every
 * prefix of a real answer with isStreamActive, splits it, and renders its
 * text blocks through the real prose leaf (BasicMarkdownContent) and the real
 * MarkdownCore front door → react-markdown. Only Next's `dynamic` boundary is
 * resolved synchronously-ish (React.lazy over the real module) and the heavy
 * non-text block surfaces are stubbed.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Every `dynamic()` boundary loads its REAL module through React.lazy, so the
// MarkdownCore front door — where streaming healing lives — is exercised as
// production renders it.
jest.mock("next/dynamic", () => {
  const react = jest.requireActual("react") as typeof React;
  return (
    loader: () => Promise<
      { default?: React.ComponentType } | React.ComponentType
    >,
  ) => {
    const Lazy = react.lazy(async () => {
      const mod = await loader();
      const component =
        (mod as { default?: React.ComponentType }).default ??
        (mod as React.ComponentType);
      return { default: component };
    });
    return function DynamicBoundary(props: Record<string, unknown>) {
      return react.createElement(
        react.Suspense,
        { fallback: null },
        react.createElement(Lazy, props),
      );
    };
  };
});

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ activeRequests: { byRequestId: {} } }),
  useAppDispatch: () => () => undefined,
}));

jest.mock(
  "@/components/mardown-display/blocks/json/useBoundAgentOutputSchema",
  () => ({ useBoundAgentOutputSchema: () => null }),
);

jest.mock(
  "@/features/agents/redux/execution-system/messages/messages.selectors",
  () => ({ selectMessageInterleavedContent: () => () => [] }),
);

// Text blocks render through the REAL prose leaf; any other block type is
// marked so the test can refuse it (these answers must split to text only).
jest.mock(
  "@/components/mardown-display/chat-markdown/internal-handlers/SafeBlockRenderer",
  () => {
    const react = jest.requireActual("react") as typeof React;
    const { BasicMarkdownContent } = jest.requireActual(
      "@/components/mardown-display/chat-markdown/BasicMarkdownContent",
    ) as typeof import("@/components/mardown-display/chat-markdown/BasicMarkdownContent");
    return {
      SafeBlockRenderer: ({
        block,
        isStreamActive,
      }: {
        block: { type: string; content: string };
        isStreamActive?: boolean;
      }) =>
        block.type === "text"
          ? react.createElement(
              "div",
              { "data-block-type": "text" },
              react.createElement(BasicMarkdownContent, {
                content: block.content,
                isStreamActive,
                showCopyButton: false,
              }),
            )
          : react.createElement("div", { "data-block-type": block.type }),
    };
  },
);

jest.mock(
  "@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor",
  () => ({ __esModule: true, default: () => null }),
);
jest.mock(
  "@/components/mardown-display/chat-markdown/internal-handlers/ToolHandlers",
  () => ({
    InlineToolCard: () => null,
    DbToolCard: () => null,
    InlineToolBatch: () => null,
    DbToolBatch: () => null,
  }),
);
jest.mock(
  "@/components/mardown-display/chat-markdown/internal-handlers/InlineStatusIndicator",
  () => ({ InlineStatusIndicator: () => null }),
);
jest.mock(
  "@/components/mardown-display/chat-markdown/internal-handlers/InlineThinkingSlot",
  () => ({ InlineThinkingSlot: () => null }),
);
jest.mock(
  "@/components/mardown-display/chat-markdown/internal-handlers/InlineAssistantError",
  () => ({ InlineAssistantError: () => null }),
);
jest.mock(
  "@/features/tool-call-visualization/components/AgentWorkGroup",
  () => ({
    AgentWorkGroup: ({ children }: { children: React.ReactNode }) => children,
  }),
);
jest.mock("@/features/tool-call-visualization/registry/registry", () => ({
  getToolDisplayMode: () => "auto",
}));
jest.mock(
  "@/features/tool-call-visualization/components/LiveToolCallCard",
  () => ({ LiveToolCallCard: () => null }),
);

import { EnhancedChatMarkdownInternal } from "@/components/mardown-display/chat-markdown/EnhancedChatMarkdown";
import { ImagePolicyProvider } from "@/components/rich-content/prose/remote-image-policy";

interface StreamCase {
  name: string;
  answer: string;
  /** The complete image URLs — the ONLY srcs an <img> may ever carry. */
  images: string[];
  /** The complete link targets the finished answer links to. */
  links: string[];
}

// A hauling company's assistant answering a customer about e-waste pickup:
// inline link, inline image, a reference-style image whose definition arrives
// LAST (the exact shape that fetched partial URLs), emphasis mid-sentence.
const PICKUP_ANSWER = `Our **e-waste pickup** runs every Tuesday. Before the driver arrives, read the [preparation checklist](https://docs.greenroutehauling.com/e-waste/prep-checklist) and stack items by the curb.

Here is how a ready pile looks: ![Curbside e-waste pile](https://images.greenroutehauling.com/pickup/curbside-pile.jpg) with monitors on the bottom.

Loose batteries go in the sealed tote below, never in the pile.

![Sealed battery tote][tote]

Questions? Call dispatch or check *our* [pickup calendar](https://greenroutehauling.com/calendar).

[tote]: https://images.greenroutehauling.com/pickup/battery-tote.jpg "Sealed battery tote"`;

// A dental practice's assistant answering a new patient: list items carrying
// links, inline code-ish reference numbers, a reference-style LINK.
const INTAKE_ANSWER = `Welcome to *Harbor Dental*! Three things before your first visit:

- Fill in the [new-patient intake form](https://harbordental.clinic/forms/new-patient) — it takes about ten minutes.
- Bring your insurance card; our billing code is \`HD-2291\`.
- Review the [financial policy][policy] so there are **no surprises** at checkout.

Your hygienist will send a photo of the parking entrance: ![Parking entrance on Bay Street](https://harbordental.clinic/img/parking-entrance.png) — use the second door.

[policy]: https://harbordental.clinic/policies/financial`;

const CASES: StreamCase[] = [
  {
    name: "e-waste pickup answer (inline + reference image)",
    answer: PICKUP_ANSWER,
    images: [
      "https://images.greenroutehauling.com/pickup/curbside-pile.jpg",
      "https://images.greenroutehauling.com/pickup/battery-tote.jpg",
    ],
    links: [
      "https://docs.greenroutehauling.com/e-waste/prep-checklist",
      "https://greenroutehauling.com/calendar",
    ],
  },
  {
    name: "new-patient intake answer (list links + reference link)",
    answer: INTAKE_ANSWER,
    images: ["https://harbordental.clinic/img/parking-entrance.png"],
    links: [
      "https://harbordental.clinic/forms/new-patient",
      "https://harbordental.clinic/policies/financial",
    ],
  },
];

/** Raw markdown syntax that must never be visible while streaming. */
const RAW_SYNTAX = ["](", "![", "**", "][", "]:"];

describe("streaming healing in the markdown core", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    jest
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  async function renderAnswer(content: string, isStreamActive: boolean) {
    await act(async () => {
      root.render(
        // The viewer's own text: remote images load, so the test sees every fetch.
        <ImagePolicyProvider value="self">
          <EnhancedChatMarkdownInternal
            content={content}
            isStreamActive={isStreamActive}
            hideCopyButton
            allowFullScreenEditor={false}
          />
        </ImagePolicyProvider>,
      );
    });
  }

  function blockTypes(): string[] {
    return Array.from(container.querySelectorAll("[data-block-type]")).map(
      (el) => el.getAttribute("data-block-type") ?? "",
    );
  }

  it.each(CASES)(
    "never fetches a partial URL nor shows raw syntax mid-stream: $name",
    async ({ answer, images, links }) => {
      const violations: string[] = [];
      // Every prefix of the answer, one character at a time — the stream
      // can stop anywhere.
      for (let end = 1; end < answer.length; end += 1) {
        const prefix = answer.slice(0, end);
        await renderAnswer(prefix, true);
        for (const img of Array.from(container.querySelectorAll("img"))) {
          const src = img.getAttribute("src") ?? "";
          if (!images.includes(src)) {
            violations.push(`prefix ${end}: <img src="${src}">`);
          }
        }
        // A link mid-stream points at its COMPLETE target or is not a link yet.
        for (const a of Array.from(container.querySelectorAll("a"))) {
          const href = (a.getAttribute("href") ?? "").replace(
            /[?&]utm_source=aimatrx$/,
            "",
          );
          if (!href.startsWith("#") && !links.includes(href)) {
            violations.push(`prefix ${end}: <a href="${href}">`);
          }
        }
        const text = container.textContent ?? "";
        for (const raw of RAW_SYNTAX) {
          if (text.includes(raw)) {
            violations.push(
              `prefix ${end}: raw "${raw}" in «${text.slice(-60)}»`,
            );
          }
        }
        if (violations.length > 8) break;
      }
      expect(violations).toEqual([]);
    },
    120_000,
  );

  it.each(CASES)(
    "renders the finished answer with every image and link: $name",
    async ({ answer, images, links }) => {
      await renderAnswer(answer, false);
      expect(blockTypes().every((t) => t === "text")).toBe(true);
      const srcs = Array.from(container.querySelectorAll("img")).map((img) =>
        img.getAttribute("src"),
      );
      expect(srcs).toEqual(images);
      const hrefs = Array.from(container.querySelectorAll("a"))
        .map((a) => a.getAttribute("href"))
        .filter((href): href is string => !!href && !href.startsWith("#"))
        // Outbound links carry our attribution tag; the target is what matters.
        .map((href) => href.replace(/[?&]utm_source=aimatrx$/, ""));
      expect(hrefs).toEqual(links);
    },
  );
});
