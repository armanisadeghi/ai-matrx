"use client";

// features/applets-host/builder/BuildHistory.tsx — what she has asked this build for, newest first,
// read from the build's record (metadata.build.requests), so it is the same after a refresh.

import { Badge } from "@ai-matrx/design-system/controls";

import { requestOutcome, type BuildEntry } from "./build-session";

export function BuildHistory({ requests }: { requests: BuildEntry[] }) {
  if (requests.length === 0) return null;
  return (
    <ol className="flex min-h-0 flex-col gap-1 overflow-y-auto text-sm" aria-label="Your requests" data-applet-build-history="">
      {requests.map((entry, index) => ({ entry, index })).reverse().map(({ entry, index }) => {
        const { label, tone } = requestOutcome(requests, index);
        return (
          <li key={entry.id} className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2 py-1">
            <span className="min-w-0 flex-1 truncate" title={entry.error ? `${entry.text} — ${entry.error}` : entry.text}>
              {entry.fix ? "Fix it" : entry.text}
            </span>
            <Badge tone={tone}>{label}</Badge>
          </li>
        );
      })}
    </ol>
  );
}
