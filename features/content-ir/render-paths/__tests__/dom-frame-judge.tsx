/**
 * THE DOM FRAME JUDGE (G2) — renders a frame through the REAL BlockRenderer
 * path in jsdom and reads what reached the DOM with the same scan the runtime
 * leak sentinel uses (`domLeaksKind`): a `__kind` key in rendered text — or in a
 * title / aria-label / alt attribute — outside
 * a `data-kind-source` container is raw. `decideBlockRender` (the pure judge,
 * `draws-raw-kind-json.ts`) answers what the renderer DECIDES; this answers
 * what it DRAWS — table cells, KindTextGate rescues and every leaf included.
 *
 * Import this module FIRST in a suite: its `jest.mock`s (next/dynamic as a
 * real React.lazy edge so every chunk loads, redux hooks over an empty store,
 * navigation, ResizeObserver) must register before BlockRenderer loads.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// jsdom has no IntersectionObserver; CodeBlock's sticky buttons observe its
// edges. Without it a ```json card THREW in the judge and drew nothing — so a
// raw card passed (H3d). An inert stand-in that never reports an intersection.
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = "0px";
    readonly scrollMargin = "0px";
    readonly thresholds: ReadonlyArray<number> = [0];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}
if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

jest.mock("next/dynamic", () => {
  const react = jest.requireActual("react") as typeof React;
  return (loader: () => Promise<{ default?: React.ComponentType } | React.ComponentType>) => {
    const Lazy = react.lazy(async () => {
      const mod = await loader();
      return { default: (mod as { default?: React.ComponentType }).default ?? (mod as React.ComponentType) };
    });
    return function DynamicBoundary(props: Record<string, unknown>) {
      return react.createElement(react.Suspense, { fallback: null }, react.createElement(Lazy, props));
    };
  };
});
jest.mock("@/lib/redux/hooks", () => {
  const empty = { activeRequests: { byRequestId: {} } };
  // A suite may hand the judge a REAL store's state (`judgeReadsState`, K5);
  // otherwise every selector reads the empty store.
  const state = () =>
    ((globalThis as { __domFrameJudgeState?: () => unknown }).__domFrameJudgeState?.() ?? empty) as object;
  return {
    useAppDispatch: () => () => undefined,
    useAppSelector: (selector: (s: unknown) => unknown) => {
      try {
        return selector(state());
      } catch {
        return undefined;
      }
    },
    useAppStore: () => ({ getState: state, dispatch: () => undefined, subscribe: () => () => undefined }),
  };
});

/**
 * Let the judge's selectors read a REAL store (K5): pass the state getter of a
 * store built from the production slice reducers. `null` returns to the
 * empty store.
 */
export function judgeReadsState(getState: (() => unknown) | null): void {
  (globalThis as { __domFrameJudgeState?: (() => unknown) | undefined }).__domFrameJudgeState =
    getState ?? undefined;
}
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, prefetch: () => undefined }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// eslint-disable-next-line import/first -- the mocks above must register before the renderer loads
import { BlockRenderer, decideBlockRender } from "@ai-matrx/rich-content/display/chat-markdown/block-registry/BlockRenderer";
// eslint-disable-next-line import/first
import { renderBlockToContentBlock } from "@ai-matrx/rich-content/display/chat-markdown/render-block-to-content-block";
// eslint-disable-next-line import/first
import { readEnvelope } from "@ai-matrx/rich-content/kinds/redux/render-block-envelope";
// eslint-disable-next-line import/first
import { TooltipProvider } from "@/components/ui/tooltip";
// eslint-disable-next-line import/first
import {
  endsInPartialKindKey,
  hasKindKey,
  isJson5Language,
  jsonKindSignal,
  markdownCarriesKind,
} from "@/features/content-ir/surfaces/json-kind-signal";
// eslint-disable-next-line import/first
import { domLeaksKind, visibleKindText } from "@/features/content-ir/surfaces/kind-leak-scan";

export interface DomFrameVerdict {
  raw: boolean;
  /** Nothing was drawn: no visible text and no loader / kind element (H3a). */
  empty: boolean;
  /** The frame fails the law: a raw kind on screen, or an empty frame. */
  failed: boolean;
  /** The rendered text outside source containers (for failure messages). */
  text: string;
  /** The drawn markup, truncated (for failure messages on an empty frame). */
  html: string;
}

async function flush(container: HTMLElement): Promise<void> {
  let last = "";
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const now = container.innerHTML;
    if (i > 1 && now === last) return;
    last = now;
  }
}

/**
 * Draw `block` exactly as the chat does (BlockRenderer with the MESSAGE's
 * stream state) and report whether a kind reached the DOM as text.
 */
export async function domFrameVerdict(
  block: RenderBlockPayload,
  options: { isStreamActive?: boolean } = {},
): Promise<DomFrameVerdict> {
  const isStreamActive = options.isStreamActive ?? block.status === "streaming";
  return domElementVerdict(
    React.createElement(BlockRenderer, {
      block: renderBlockToContentBlock(block) as never,
      index: block.blockIndex ?? 0,
      isStreamActive,
      replaceBlockContent: () => undefined,
      handleOpenEditor: () => undefined,
    }),
  );
}

/**
 * Draw any element in the judge's jsdom (the self-test plants frames with
 * it) and read the DOM: raw when a kind key shows outside a source container,
 * empty when nothing at all was drawn.
 */
export async function domElementVerdict(element: React.ReactElement): Promise<DomFrameVerdict> {
  const container = judgeContainer();
  const root = createRoot(container);
  let drawn: Node[] = [];
  try {
    await act(async () => {
      // The app's providers a leaf needs to draw at all (CodeBlock's tooltips).
      root.render(React.createElement(TooltipProvider, null, element));
    });
    await flush(container);
    // Text AND readable attributes — the sentinel's own scan (K3).
    const raw = domLeaksKind(container);
    const empty = !drewSomething(container);
    return {
      raw,
      empty,
      failed: raw || empty,
      // As drawn (typographic quotes kept), so "as written" is checkable byte for byte.
      text: visibleKindText(container, 4000, false),
      html: container.innerHTML.slice(0, 600),
    };
  } finally {
    drawn = Array.from(container.childNodes);
    act(() => root.unmount());
    container.replaceChildren();
    // jsdom's selector engine (nwsapi) caches element references across
    // queries; a cached node kept its whole detached frame alive (~1 MB per
    // frame — every-frame judging ran out of heap). Unlink every frame's tree
    // so a cached node retains only itself.
    for (const node of drawn) unlinkTree(node);
  }
}

/**
 * ONE container for every frame: React hangs ~100 root listeners on a root's
 * container, and nwsapi's cache kept every per-frame container (and its
 * listeners) alive. A fresh root each frame, the same element.
 */
let sharedContainer: HTMLDivElement | null = null;
function judgeContainer(): HTMLDivElement {
  if (!sharedContainer || !sharedContainer.isConnected) {
    sharedContainer = document.createElement("div");
    document.body.appendChild(sharedContainer);
  }
  return sharedContainer;
}

function unlinkTree(node: Node): void {
  const stack: Node[] = [node];
  while (stack.length) {
    const current = stack.pop()!;
    while (current.firstChild) {
      const child = current.firstChild;
      current.removeChild(child);
      stack.push(child);
    }
  }
}

/**
 * What counts as drawn without text: a loader, a skeleton, a kind's own
 * element, an image or a media/graphic element.
 */
const DRAWN_WITHOUT_TEXT = [
  '[role="status"]',
  '[role="progressbar"]',
  "[aria-busy]",
  "[data-kind]",
  "[data-kind-route]",
  "[data-kind-loader]",
  "[data-kind-loading]",
  "[data-kind-slot]",
  "[data-kind-renderer]",
  "img",
  "svg",
  "canvas",
  "video",
  "audio",
  "iframe",
  "hr",
].join(",");

/** Whether anything reached the screen: visible text (source panes included) or a loader / kind element. */
function drewSomething(container: HTMLElement): boolean {
  if ((container.textContent ?? "").trim()) return true;
  return container.querySelector(DRAWN_WITHOUT_TEXT) !== null;
}

/**
 * Whether a frame's SOURCE holds a `__kind` key (only those frames can leak) —
 * as JSON spells it, as JSON5 does in a ```json5 fence, and as markdown
 * escapes it (`"\_\_kind"`, which the renderer un-escapes on screen — H3b).
 */
export function frameHoldsKind(block: RenderBlockPayload): boolean {
  const language = (block.data as { language?: unknown } | null | undefined)?.language;
  return hasKindKey(block.content ?? "", {
    json5: isJson5Language(typeof language === "string" ? language : null),
    markdown: true,
  });
}

/** Every frame whose source holds a `__kind` key, in order (H3c: nothing sampled away). */
export function everyKindFrame<T extends { block: RenderBlockPayload }>(frames: T[]): T[] {
  return frames.filter((frame) => frameHoldsKind(frame.block));
}

/**
 * Everything that picks the renderer's BRANCH for a frame: block type, stream
 * state, the renderer's own routing decision and gate, the routed language,
 * the envelope's kind and state, and the content's kind signals. Two frames
 * with the same signature are drawn by the same branch.
 */
function branchSignature(block: RenderBlockPayload, live: boolean): string {
  let routedType = "";
  let routedLanguage = "";
  let gate = "";
  try {
    const decision = decideBlockRender(renderBlockToContentBlock(block) as never, { isStreamActive: live });
    const routed = decision.block as { type?: string; language?: string };
    routedType = routed.type ?? "";
    routedLanguage = routed.language ?? "";
    gate = decision.gate ? String((decision.gate as { kind?: unknown }).kind ?? "gate") : "";
  } catch (error) {
    // A decision that throws is a branch of its own — but never a silent one:
    // a broken judge (a missing import) must not pass as "threw" forever.
    if (error instanceof ReferenceError || error instanceof TypeError) throw error;
    routedType = "threw";
  }
  const metadata = (block.metadata ?? {}) as Record<string, unknown>;
  const envelope = readEnvelope(metadata) as { root?: { kind?: unknown } } | null;
  const content = block.content ?? "";
  return JSON.stringify([
    block.type,
    block.status,
    live,
    routedType,
    routedLanguage,
    gate,
    Object.keys(metadata).sort().join(","),
    envelope?.root?.kind ?? null,
    metadata.kindState ?? null,
    jsonKindSignal(content),
    markdownCarriesKind(content),
    endsInPartialKindKey(content),
  ]);
}

/**
 * The frames worth drawing without drawing all of them (H3c, round 5): every
 * kind frame where the renderer's BRANCH changes (and the frame after it), the
 * first and last kind frame of every block, and every `stride`-th kind frame
 * between. A raw state, however short, is a branch of its own — so its first
 * frame is always judged; the old fixed stride of 8 could step over it.
 */
export function transitionKindFrames<T extends { block: RenderBlockPayload }>(
  frames: T[],
  live: (frame: T) => boolean,
  stride = 4,
): T[] {
  const picked = new Set<number>();
  const lastSignature = new Map<string, string>();
  const lastKindIndex = new Map<string, number>();
  let kindCount = 0;
  frames.forEach((frame, i) => {
    if (!frameHoldsKind(frame.block)) return;
    const id = frame.block.blockId;
    const signature = branchSignature(frame.block, live(frame));
    const previous = lastSignature.get(id);
    if (previous !== signature) {
      picked.add(i);
      // The frame after a transition too: a branch that settles one frame late.
      const next = frames.findIndex((f, j) => j > i && f.block.blockId === id);
      if (next > 0) picked.add(next);
    }
    lastSignature.set(id, signature);
    lastKindIndex.set(id, i);
    kindCount += 1;
    if (kindCount % stride === 0) picked.add(i);
  });
  for (const i of lastKindIndex.values()) picked.add(i);
  return [...picked]
    .sort((a, b) => a - b)
    .map((i) => frames[i])
    .filter((frame) => frameHoldsKind(frame.block));
}
