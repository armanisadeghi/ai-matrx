"use client";

import type { ContextResourceSnapshot } from "../types";

interface ResourceSnapshotViewProps {
  snapshot: ContextResourceSnapshot;
}

/** Read-only presentation for an attach-by-value resource with no live id. */
export function ResourceSnapshotView({ snapshot }: ResourceSnapshotViewProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto p-4">
      <div className="mb-3 text-[11px] font-medium text-muted-foreground">
        Snapshot sent with this message
      </div>
      {snapshot.text ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {snapshot.text}
        </p>
      ) : (
        <dl className="space-y-2 text-sm">
          {Object.entries(snapshot.data)
            .filter(([, value]) =>
              ["string", "number", "boolean"].includes(typeof value),
            )
            .map(([key, value]) => (
              <div key={key} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
                <dt className="truncate text-xs font-medium text-muted-foreground">
                  {key.replaceAll("_", " ")}
                </dt>
                <dd className="break-words text-foreground">{String(value)}</dd>
              </div>
            ))}
        </dl>
      )}
    </div>
  );
}
