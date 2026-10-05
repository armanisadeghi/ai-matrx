/**
 * THE DOM FRAME JUDGE (G2) — renders a frame through the REAL BlockRenderer
 * path in jsdom and reads what reached the DOM with the same scan the runtime
 * leak sentinel uses (`textLeaksKind`): a `__kind` key in rendered text outside
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
  const state = { activeRequests: { byRequestId: {} } };
  return {
    useAppDispatch: () => () => undefined,
    useAppSelector: (selector: (s: unknown) => unknown) => {
      try {
        return selector(state);
      } catch {
        return undefined;
      }
    },
    useAppStore: () => ({ getState: () => state, dispatch: () => undefined, subscribe: () => () => undefined }),
  };
});
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, prefetch: () => undefined }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// eslint-disable-next-line import/first -- the mocks above must register before the renderer loads
import { BlockRenderer } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
// eslint-disable-next-line import/first
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
// eslint-disable-next-line import/first
import { hasKindKey, isJson5Language } from "@/features/content-ir/surfaces/json-kind-signal";
// eslint-disable-next-line import/first
import { textLeaksKind, visibleKindText } from "@/features/content-ir/surfaces/kind-leak-scan";

export interface DomFrameVerdict {
  raw: boolean;
  /** The rendered text outside source containers (for failure messages). */
  text: string;
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
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const isStreamActive = options.isStreamActive ?? block.status === "streaming";
  try {
    await act(async () => {
      root.render(
        React.createElement(BlockRenderer, {
          block: renderBlockToContentBlock(block) as never,
          index: block.blockIndex ?? 0,
          isStreamActive,
          replaceBlockContent: () => undefined,
          handleOpenEditor: () => undefined,
        }),
      );
    });
    await flush(container);
    return { raw: textLeaksKind(container), text: visibleKindText(container, 4000) };
  } finally {
    act(() => root.unmount());
    container.remove();
  }
}

/** Whether a frame's SOURCE holds a `__kind` key (only those frames can leak). */
export function frameHoldsKind(block: RenderBlockPayload): boolean {
  const language = (block.data as { language?: unknown } | null | undefined)?.language;
  return hasKindKey(block.content ?? "", {
    json5: isJson5Language(typeof language === "string" ? language : null),
  });
}

/**
 * The frames worth drawing: every frame where a block's `__kind` key first
 * appears, every block's last frame, plus every `stride`-th kind frame between.
 */
export function sampleKindFrames<T extends { block: RenderBlockPayload }>(frames: T[], stride = 8): T[] {
  const picked = new Set<number>();
  const seenKind = new Set<string>();
  const lastIndex = new Map<string, number>();
  let kindCount = 0;
  frames.forEach((frame, i) => {
    const id = frame.block.blockId;
    lastIndex.set(id, i);
    if (!frameHoldsKind(frame.block)) return;
    kindCount += 1;
    if (!seenKind.has(id)) {
      seenKind.add(id);
      picked.add(i);
    } else if (kindCount % stride === 0) {
      picked.add(i);
    }
  });
  for (const i of lastIndex.values()) if (frameHoldsKind(frames[i].block)) picked.add(i);
  return [...picked].sort((a, b) => a - b).map((i) => frames[i]);
}
