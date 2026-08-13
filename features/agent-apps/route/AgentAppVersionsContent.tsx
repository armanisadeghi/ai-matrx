"use client";

/**
 * AgentAppVersionsContent — /agent-apps/[id]/versions page body.
 *
 * Renders a list of `aga_versions` snapshots for an app, newest first.
 * Each row is a link to /agent-apps/[id]/v/[versionNumber] — viewing a
 * historical snapshot. The list itself is fetched on the server and
 * passed in as props (no client-side cache yet; we'll add a thunk + slice
 * if/when interactive editing of version metadata becomes a thing).
 */

import Link from "next/link";
import { History } from "lucide-react";
import type { AgentAppVersionRow } from "@/lib/agent-apps/data";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { formatDateTime } from "@/features/agent-apps/format";

interface AgentAppVersionsContentProps {
  appId: string;
  versions: AgentAppVersionRow[];
  currentVersion: number;
}

function versionHuman(v: AgentAppVersionRow, isCurrent: boolean): string {
  return [
    `v${v.version_number}${isCurrent ? " (current)" : ""}`,
    v.name,
    v.status ? `Status: ${v.status}` : null,
    `Changed: ${formatDateTime(v.changed_at)}`,
    v.change_note,
  ]
    .filter(Boolean)
    .join("\n");
}

export function AgentAppVersionsContent({
  appId,
  versions,
  currentVersion,
}: AgentAppVersionsContentProps) {
  return (
    <div
      className="h-full overflow-y-auto"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <div className="max-w-3xl mx-auto px-4 pb-6 pt-4 space-y-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Versions</h2>
          <span className="text-xs text-muted-foreground">
            ({versions.length})
          </span>
          {versions.length > 0 && (
            <CopyButtons
              size="icon"
              label="All versions"
              className="ml-auto"
              human={() =>
                versions
                  .map((v) =>
                    versionHuman(v, v.version_number === currentVersion),
                  )
                  .join("\n\n")
              }
              json={() => versions}
              agent={() => ({
                kind: "agent-app-versions",
                location: `AI Matrx — Agent App — Versions`,
                description: "All version snapshots for this agent app.",
                data: versions,
                attributes: { appId, count: versions.length, currentVersion },
              })}
            />
          )}
        </div>

        {versions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No version snapshots yet. Versions are created automatically as
            you save changes to the app.
          </div>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border bg-card">
            {versions.map((v) => {
              const isCurrent = v.version_number === currentVersion;
              return (
                <div key={v.id} className="group/x relative flex items-stretch">
                  <Link
                    href={`/agent-apps/${appId}/v/${v.version_number}`}
                    className="flex items-start gap-3 p-3 pr-28 flex-1 min-w-0 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-shrink-0 w-12 text-sm font-mono font-semibold text-foreground tabular-nums pt-0.5">
                      v{v.version_number}
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {v.name ?? "—"}
                        </span>
                        {isCurrent && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                            current
                          </span>
                        )}
                        {v.status && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground capitalize">
                            {v.status}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(v.changed_at)}
                      </div>
                      {v.change_note && (
                        <p className="text-xs text-muted-foreground/90 italic">
                          {v.change_note}
                        </p>
                      )}
                    </div>
                  </Link>
                  <CopyButtons
                    size="icon"
                    label={`v${v.version_number}`}
                    className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover/x:opacity-100 focus-within:opacity-100"
                    human={() => versionHuman(v, isCurrent)}
                    json={() => v}
                    agent={() => ({
                      kind: "agent-app-version",
                      location: `AI Matrx — Agent App — Versions`,
                      description: "A single version snapshot row.",
                      data: v,
                      summary: versionHuman(v, isCurrent),
                      attributes: {
                        appId,
                        version: v.version_number,
                        current: isCurrent,
                      },
                    })}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
