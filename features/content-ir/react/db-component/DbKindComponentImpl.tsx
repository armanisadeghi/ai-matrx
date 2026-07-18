"use client";

/**
 * DbKindComponentImpl — renders a kind's DB-stored user component
 * (`content_ir.kind_component`, `source='db'`), the `db_kind_component`
 * block type produced by `applyIrKindRoute`'s db-override flip.
 *
 * This is the SYNCHRONOUS-compiler path (the shared allowlist compiler);
 * the component itself loads lazily (DbKindComponent.tsx) so
 * `@babel/standalone` never enters the main chat bundle.
 *
 * Resolution per render:
 *  1. Read the kind + instance value from the block's `metadata.__ir`
 *     envelope (`reconstructRegionValue` — residues merged back, zero-loss);
 *     floor: `JSON.parse(content)`.
 *  2. Re-resolve the db row via `resolveComponent(kind, "web", "output")`.
 *     Routing already proved a db row won, and the resolver is a module
 *     singleton, so this is warm by construction; a miss here is a real
 *     defect → scream + generic viewer (R6 — never a blank hole).
 *  3. `config.flavor === 'html'` → the sandboxed iframe flavor
 *     (KindHtmlFrame). Otherwise compile + render inside the error boundary
 *     (fallback = the kind's generic structured viewer).
 */

import React from "react";

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import GenericStructuredBlock from "@/components/mardown-display/blocks/generic/GenericStructuredBlock";
import { readEnvelope } from "../../redux/render-block-envelope";
import { reconstructRegionValue } from "../../core/envelope-value";
import { resolveComponent } from "../../registry/component-registry";
import {
  applyPropsTransform,
  getOrCompileDbKindComponent,
} from "./dbKindComponentCache";
import { DbKindComponentErrorBoundary } from "./DbKindComponentErrorBoundary";
import { KindHtmlFrame } from "./KindHtmlFrame";

export interface DbKindComponentImplProps {
  /** Raw region source — the zero-loss floor + the generic viewer's input. */
  content: string;
  /** Carries `__ir` (the parsed envelope) and `__ir_route` (the marker). */
  metadata?: Record<string, unknown>;
  className?: string;
}

const screamedDefects = new Set<string>();

/** Loud recovery: a routed db block whose row can no longer be resolved. */
function screamRouteDefect(kindLabel: string, reason: string): void {
  const message = `[content-ir] db_kind_component block for "${kindLabel}" cannot render its DB row (${reason}) — falling back to the generic structured viewer.`;
  if (!screamedDefects.has(`${kindLabel}:${reason}`)) {
    screamedDefects.add(`${kindLabel}:${reason}`);
    console.error(message);
  }
  captureError({
    source: "content-ir",
    message,
    raw: { kind: kindLabel, reason },
  });
}

function readInstanceValue(
  content: string,
  metadata: Record<string, unknown> | undefined,
): { kind: string | null; value: unknown } {
  const envelope = readEnvelope(metadata);
  if (envelope?.root.kind) {
    return { kind: envelope.root.kind, value: reconstructRegionValue(envelope) };
  }
  try {
    const parsed = JSON.parse(content) as unknown;
    const kind =
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as Record<string, unknown>).__kind === "string"
        ? ((parsed as Record<string, unknown>).__kind as string)
        : null;
    return { kind, value: parsed };
  } catch {
    return { kind: null, value: null };
  }
}

export const DbKindComponentImpl: React.FC<DbKindComponentImplProps> = ({
  content,
  metadata,
  className,
}) => {
  const generic = (
    <GenericStructuredBlock
      content={content}
      metadata={metadata}
      className={className}
    />
  );

  const { kind, value } = readInstanceValue(content, metadata);
  if (!kind) {
    screamRouteDefect("(unresolvable)", "no kind in envelope or content");
    return generic;
  }

  const resolution = resolveComponent(kind, "web", "output");
  if (
    !resolution ||
    resolution.resolvedBy !== "db" ||
    resolution.source !== "db" ||
    !resolution.isActive ||
    !resolution.componentSource
  ) {
    screamRouteDefect(kind, "resolver no longer answers with an active db row");
    return generic;
  }

  // ── html/js flavor (the user's OPTION, config.flavor === "html") ──────────
  if (resolution.config.flavor === "html") {
    return (
      <KindHtmlFrame
        kind={kind}
        html={resolution.componentSource}
        data={value}
        className={className}
      />
    );
  }

  // ── react flavor: shared allowlist compile ────────────────────────────────
  const compiled = getOrCompileDbKindComponent(kind, resolution);
  if (!compiled.ok) {
    // Already screamed (cache screams once per key, captures every attempt).
    return generic;
  }

  const data = applyPropsTransform(kind, compiled.compiled, value);
  const Component = compiled.compiled.Component;

  return (
    <DbKindComponentErrorBoundary kind={kind} fallback={generic}>
      <Component data={data} kind={kind} config={resolution.config} />
    </DbKindComponentErrorBoundary>
  );
};
