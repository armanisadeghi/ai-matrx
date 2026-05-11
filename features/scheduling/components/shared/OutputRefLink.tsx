// features/scheduling/components/shared/OutputRefLink.tsx
//
// Polymorphic deep-link to whatever the run produced. Switches on
// `output_ref.kind` per docs/SCHEDULING.md §6.

"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { OutputRef } from "../../types";

interface Props {
  outputRef: OutputRef | null;
}

export function OutputRefLink({ outputRef }: Props) {
  if (!outputRef) return null;

  const href = hrefForOutputRef(outputRef);
  if (!href) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {labelFor(outputRef)} #{outputRef.id.slice(0, 8)}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
    >
      Open {labelFor(outputRef)}
      <ExternalLink className="h-3 w-3" />
    </Link>
  );
}

function hrefForOutputRef(ref: OutputRef): string | null {
  switch (ref.kind) {
    case "conversation":
      return `/agents?conversation=${ref.id}`;
    case "capture":
      return `/scraper/captures/${ref.id}`;
    case "workflow_run":
      return `/workflows/runs/${ref.id}`;
    default:
      return null;
  }
}

function labelFor(ref: OutputRef): string {
  switch (ref.kind) {
    case "conversation":
      return "conversation";
    case "capture":
      return "capture";
    case "workflow_run":
      return "workflow run";
    default:
      return ref.kind;
  }
}
