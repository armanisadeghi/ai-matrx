"use client";

/**
 * KindInstanceRender — render ONE canonical kind instance through the REAL
 * production path, never a lookalike: the value object is wrapped by the same
 * complete-envelope assembler the splitter/rehydration use
 * (`envelopeFromCompleteValue`), placed on a raw render block's
 * `metadata.__ir`, and handed to the production `SafeBlockRenderer` — whose
 * `BlockRenderer` runs `applyIrKindRoute` exactly as it does for streamed chat
 * content (db-sourced `kind_component` renderers resolve through the same
 * route automatically). If the kind has no registered component/bridge, the
 * block stays a generic code block — shown honestly, never faked.
 *
 * Extracted from the admin KindPreviewTab so the studio's Preview + Test tabs
 * and the admin page share ONE render engine (no second preview fork).
 * SafeBlockRenderer already owns the `ssr:false` dynamic boundary for the
 * heavy renderer; this shell is light on purpose.
 */

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { SafeBlockRenderer } from "@/components/mardown-display/chat-markdown/internal-handlers/SafeBlockRenderer";
import type { RenderBlock } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { envelopeFromCompleteValue } from "@/features/content-ir/core/normalize";
import { IR_ENVELOPE_KEY } from "@/features/content-ir/core/ir-types";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import {
  componentRegistry,
  resolveComponent,
} from "@/features/content-ir/registry/component-registry";

const noopReplaceBlockContent = (_original: string, _replacement: string) => {};
const noopOpenEditor = () => {};

export function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * True when `applyIrKindRoute` has a registered render path for this kind —
 * a compiled legacy bridge OR any ACTIVE resolver row (including db-sourced
 * user components, which route to `db_kind_component`). Mirrors the route's
 * own decision order; requires the resolver warm tier for db rows (see the
 * warm tick in KindInstanceRender).
 */
export function kindIsRoutable(kind: string): boolean {
  if (kindRegistry.getDefinition(kind)?.legacyBlockType) return true;
  return Boolean(resolveComponent(kind, "web", "output")?.isActive);
}

interface KindInstanceRenderProps {
  kind: string;
  /** The canonical instance value (kind_example.data or a form-emitted instance). */
  value: unknown;
  /** Show the honest "no component registered" banner when unroutable. */
  showRoutingNote?: boolean;
}

export default function KindInstanceRender({
  kind,
  value,
  showRoutingNote = true,
}: KindInstanceRenderProps) {
  // Routing must be judged with the WARM tiers in (user kind definitions +
  // `kind_component` resolver rows — including source='db' user components).
  // Kick both warms and re-render once they land; then refresh-on-view
  // (rate-limited + deduped) so an EDITED db component renders fresh here —
  // server edits never push to open clients, this call is the contract.
  const [, setWarmTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const rerender = () => {
      if (!cancelled) setWarmTick((t) => t + 1);
    };
    const unsubscribe = componentRegistry.subscribe(rerender);
    void Promise.allSettled([
      kindRegistry.ensureWarm(),
      componentRegistry.ensureWarm(),
    ]).then(() => {
      rerender();
      void componentRegistry.refreshKindComponents();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const routable = kindIsRoutable(kind);

  const block: RenderBlock | null = isRecordValue(value)
    ? {
        type: "code",
        content: JSON.stringify(value, null, 2),
        language: "json",
        metadata: {
          [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(value, kind),
        },
      }
    : null;

  return (
    <div className="space-y-3">
      {showRoutingNote && !routable && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <Info className="h-3.5 w-3.5 shrink-0" />
          This shape has no custom component yet, so it renders through the
          generic viewer — exactly what production shows today.
        </div>
      )}
      {block ? (
        <div className="rounded-md border border-border bg-card p-3">
          <SafeBlockRenderer
            block={block}
            index={0}
            replaceBlockContent={noopReplaceBlockContent}
            handleOpenEditor={noopOpenEditor}
          />
        </div>
      ) : (
        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" />
            This value is a JSON scalar/array (workflow I/O shape) — there is
            no block render path for it; raw value below.
          </div>
          <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 font-mono text-xs text-foreground">
            {JSON.stringify(value, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
