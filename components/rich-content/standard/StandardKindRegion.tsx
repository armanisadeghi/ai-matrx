"use client";

// ─────────────────────────────────────────────────────────────────────────
// A kind region at the `standard` level (Arman, 2026-09-30: a kind is never
// drawn as raw JSON). The standard level was built without the kind registry
// — a structured payload showed as its JSON source — which put raw kind JSON
// on every share page, public resource body and nested section. A region
// whose JSON carries `__kind` now renders through the ONE kind route,
// `KindInstanceRender` (its own floor is `StructuredValueView`).
//
// Reached ONLY through `React.lazy` from StandardBlocks: the kind route ends
// in the full block engine, which statically imports StandardBlocks, so a
// static edge would be a module cycle and would load the engine on every
// notes-like page that never shows a kind. Public pages: the route is
// client-only (the block renderer is `ssr:false`), and the kind registry's
// catalog read is a plain table read that comes back empty for an anonymous
// reader — compiled system kinds still route, and an unknown kind falls to
// the structured floor. Nothing here needs a signed-in person.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import { humanizeKind } from "@/features/content-ir/kinds/kind-markdown-utils";

function kindOf(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = (value as Record<string, unknown>).__kind;
  return typeof kind === "string" && kind.trim() ? kind : null;
}

function OneValue({ value }: { value: unknown }) {
  const kind = kindOf(value);
  if (!kind) return <StructuredValueView value={value} />;
  return (
    <KindInstanceRender
      kind={kind}
      value={value as Record<string, unknown>}
      showRoutingNote={false}
      variant="bare"
      unroutableFallback={<StructuredValueView value={value} kind={kind} />}
    />
  );
}

/** A complete kind region: one kind, or a list of them. */
export function StandardKindValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <div className="my-3 space-y-3" data-standard-kind-region="">
        {value.map((item, index) => (
          <OneValue key={index} value={item} />
        ))}
      </div>
    );
  }
  return (
    <div className="my-3" data-standard-kind-region="">
      <OneValue value={value} />
    </div>
  );
}

/**
 * A settled region that claims a kind but is not valid JSON — the kind's
 * broken state: its name, a plain notice, and the source behind an explicit
 * "View source" control (never shown by default).
 */
export function StandardBrokenKind({
  slug,
  source,
}: {
  slug: string | null;
  source: string;
}) {
  const [open, setOpen] = useState(false);
  const name = slug ? humanizeKind(slug) : "This content";
  return (
    <div
      className="my-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
      data-standard-kind-broken=""
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{name} could not be read</span>
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide source" : "View source"}
        </button>
      </div>
      {open ? (
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs">
          {source}
        </pre>
      ) : null}
    </div>
  );
}

export default StandardKindValue;
