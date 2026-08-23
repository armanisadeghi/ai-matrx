"use client";

/**
 * THE MATRIX HOST for `@ai-matrx/content-ir-react`.
 *
 * The package draws kinds; it refuses to know what a block renderer, a
 * structured-value floor, a shimmer, or a notice look like in THIS app. This
 * module supplies all four, plus the registries and the Error Inspector, as one
 * module-singleton host object.
 *
 * WHY A BOUNDARY COMPONENT INSTEAD OF ONE ROOT PROVIDER. Kind rendering happens
 * deep inside chat, workflow, canvas, education, and admin trees that were
 * built long before this package existed — some of them mounted through
 * `next/dynamic` islands with no shared ancestor. Threading a provider through
 * every one of them to deliver a value that is a MODULE SINGLETON would be
 * churn with no benefit: the context value is referentially stable, so nesting
 * this boundary at each entry point costs nothing and cannot go stale. Each
 * adapter component below wraps itself.
 */

import { useMemo, type ReactNode } from "react";
import { Info } from "lucide-react";
import {
  ContentIrRenderProvider,
  type ContentIrHost,
} from "@ai-matrx/content-ir-react";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { ShimmerText } from "@/components/loaders/ShimmerText";
import { SafeBlockRenderer } from "@/components/mardown-display/chat-markdown/internal-handlers/SafeBlockRenderer";
import type { RenderBlock } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import { kindRegistry } from "../registry/kind-registry";
import { componentRegistry } from "../registry/component-registry";
import { MATRX_CONTENT_IR_PLATFORM } from "./route-env";

const noopReplaceBlockContent = (_original: string, _replacement: string) => {};
const noopOpenEditor = () => {};

/**
 * The single host instance. A module singleton on purpose — the registries it
 * points at are singletons, and a per-render object would make every memo in
 * the package churn.
 */
export const matrxContentIrHost: ContentIrHost = {
  platform: MATRX_CONTENT_IR_PLATFORM,
  kinds: kindRegistry,
  components: componentRegistry,
  reportError: captureError,

  // The production render path: SafeBlockRenderer owns the `ssr:false` dynamic
  // boundary, and BlockRenderer inside it runs `applyIrKindRoute` exactly as it
  // does for streamed chat content — so a kind instance and a streamed region
  // land on the same component, which is the whole point.
  renderBlock: (block) => (
    <SafeBlockRenderer
      block={block as RenderBlock}
      index={0}
      replaceBlockContent={noopReplaceBlockContent}
      handleOpenEditor={noopOpenEditor}
    />
  ),

  // THE FLOOR. `StructuredValueView` is the platform-wide door onto the
  // recursive value renderer (prose through the canonical markdown renderer,
  // uniform object arrays as a real table, media through `InlineMediaRef`).
  renderValue: ({ value, kind, note, footer }) => (
    <StructuredValueView
      value={value}
      kind={kind}
      {...(note === undefined ? {} : { note })}
      {...(footer === undefined ? {} : { footer })}
    />
  ),

  renderShimmer: (text) => <ShimmerText text={text} className="text-[10px]" />,

  renderNotice: (text) => (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
      <Info className="h-3.5 w-3.5 shrink-0" />
      {text}
    </div>
  ),
};

/** Wrap any subtree that renders kinds through the shared package. */
export function ContentIrHostBoundary({ children }: { children: ReactNode }) {
  // Stable by construction (module singleton); the memo only documents that.
  const host = useMemo(() => matrxContentIrHost, []);
  return (
    <ContentIrRenderProvider host={host}>{children}</ContentIrRenderProvider>
  );
}
