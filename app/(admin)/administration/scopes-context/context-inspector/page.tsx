"use client";

/**
 * Context inspector — what an agent is handed, drilled down in order:
 * Organization → Scope type → Scope → Context item (lane
 * CONTEXT-INSPECTOR-GUIDED, 2026-09-25). The old page was four free-text slug
 * boxes, a tier and a serializer-variation picker and a Render button, with a
 * separate "paste a scope id" compare under it — every field independent of the
 * others, so nothing told you which one to fill. Now each choice narrows the
 * next and the old-vs-new compare follows it live.
 *
 * The address IS the selection (`?org=&scopeType=&scope=&item=`), written
 * through the URL-state door (never a navigation). Old links that carry only
 * `?scope=<id>` still open: the scope names its organization and type.
 */

import { Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Braces } from "lucide-react";

import {
  currentPathWithSearch,
  pushAddressWithoutNavigating,
  replaceAddressWithoutNavigating,
} from "@/lib/url-state/addressWithoutNavigating";
import { ContextInspector } from "@/features/agents/components/context-preview/inspector/ContextInspector";
import {
  parseSelection,
  selectionSearch,
  type InspectorSelection,
} from "@/features/agents/components/context-preview/inspector/selection";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function InspectorFromAddress() {
  const params = useSearchParams();
  const search = params.toString();
  const selection = parseSelection(search);
  const agent = params.get("agent")?.trim() ?? "";

  const onChange = useCallback(
    (next: InspectorSelection, opts?: { replace?: boolean }) => {
      const href = currentPathWithSearch(selectionSearch(next, window.location.search));
      if (opts?.replace) replaceAddressWithoutNavigating(href);
      else pushAddressWithoutNavigating(href);
    },
    [],
  );

  return (
    <ContextInspector
      selection={selection}
      onChange={onChange}
      agentId={UUID_RE.test(agent) ? agent : undefined}
    />
  );
}

export default function ContextInspectorPage() {
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-2 p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <Braces className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold">Context inspector</h1>
        <span className="text-xs text-muted-foreground">
          Current system beside the record store, for what you choose
        </span>
      </div>
      <Suspense fallback={null}>
        <InspectorFromAddress />
      </Suspense>
    </div>
  );
}
