"use client";

/**
 * Dev demo for the one Source input: the same component in three host
 * configurations, each with its own surface key (so picks never mix), plus
 * what the host would send (`toSourceSet()`) and a button that asks the server
 * for the grounded text (`resolve()`).
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourceInput } from "@/features/resource-manager/source-input/components/SourceInput";
import { useSourceSet } from "@/features/resource-manager/source-input/useSourceSet";
import type { SourceInputProps } from "@/features/resource-manager/source-input/types";
import { sourceRefusalSentence } from "@/features/sources/api/sourcesApi";
import { ALL_SOURCE_KIND_IDS } from "@/features/resource-manager/source-input/sourceKinds";

const CONFIGS: { heading: string; props: SourceInputProps }[] = [
  {
    heading: "Every kind",
    props: { surfaceKey: "demo:all-kinds", title: "Sources", purpose: "this demo" },
  },
  {
    heading: "No images, at most three",
    props: {
      surfaceKey: "demo:no-images-max-3",
      title: "Up to three sources",
      kinds: ALL_SOURCE_KIND_IDS.filter((k) => k !== "image"),
      max: 3,
    },
  },
  {
    heading: "One required source",
    props: {
      surfaceKey: "demo:required-single",
      title: "Your source",
      kinds: ["your_sources", "files", "upload", "paste"],
      max: 1,
      required: true,
    },
  },
];

function WhatGoesOut({ surfaceKey }: { surfaceKey: string }) {
  const set = useSourceSet(surfaceKey);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  let payload: string;
  try {
    payload = JSON.stringify(set.toSourceSet(), null, 2);
  } catch (err) {
    payload = err instanceof Error ? err.message : String(err);
  }
  return (
    <details className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
      <summary className="cursor-pointer select-none text-muted-foreground">What this host would send</summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{payload}</pre>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2"
        disabled={resolving}
        onClick={async () => {
          setResolving(true);
          try {
            const r = await set.resolve();
            setResolved(
              `${r.sources.length} resolved · ${r.dropped.length} left out · ${r.total_chars} characters\n\n` +
                r.sources.map((s) => `— ${s.label} (${s.form_used}, ${s.state})\n${s.text.slice(0, 400)}`).join("\n\n"),
            );
          } catch (err) {
            setResolved(`Could not resolve: ${sourceRefusalSentence(err)}`);
          } finally {
            setResolving(false);
          }
        }}
      >
        {resolving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
        Get the grounded text
      </Button>
      {resolved ? <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{resolved}</pre> : null}
    </details>
  );
}

/**
 * `?attach=<entity_type>:<id>[:label]` files every new Source (and every
 * uploaded file) against that record — how a host passes `attachTo`.
 */
function attachFromQuery(value: string | null): SourceInputProps["attachTo"] {
  if (!value) return undefined;
  const [entityType, entityId, ...label] = value.split(":");
  return entityType && entityId
    ? { entityType, entityId, label: label.join(":") || undefined }
    : undefined;
}

export function SourceInputDemo() {
  const attachTo = attachFromQuery(useSearchParams().get("attach"));
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto max-w-4xl space-y-10 px-4 py-6 pb-safe">
        {attachTo ? (
          <p className="text-xs text-muted-foreground">
            New Sources are filed with {attachTo.label ?? `${attachTo.entityType} ${attachTo.entityId}`}.
          </p>
        ) : null}
        {CONFIGS.map((c) => (
          <div key={c.props.surfaceKey} className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.heading}</p>
            <SourceInput {...c.props} attachTo={attachTo} />
            <WhatGoesOut surfaceKey={c.props.surfaceKey} />
          </div>
        ))}
      </div>
    </div>
  );
}
