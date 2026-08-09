"use client";

// Client island for the agent-app version snapshot page (a Server Component):
// the record-level copy pair for the whole snapshot. CopyButtons is a client
// component, so it can't be dropped directly into the async server page.

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { formatDateTime } from "@/features/agent-apps/format";
import type { AgentAppVersionDetail } from "@/lib/agent-apps/data";

export function VersionRecordCopy({
  appId,
  appName,
  snapshot,
  isCurrent,
}: {
  appId: string;
  appName: string;
  snapshot: AgentAppVersionDetail;
  isCurrent: boolean;
}) {
  const human = () =>
    [
      `${appName} — v${snapshot.version_number}${isCurrent ? " (current)" : ""}`,
      snapshot.name,
      snapshot.tagline,
      snapshot.description,
      snapshot.status ? `Status: ${snapshot.status}` : null,
      snapshot.category ? `Category: ${snapshot.category}` : null,
      Array.isArray(snapshot.tags) && snapshot.tags.length > 0
        ? `Tags: ${snapshot.tags.join(", ")}`
        : null,
      `Changed: ${formatDateTime(snapshot.changed_at)}`,
      snapshot.change_note,
    ]
      .filter(Boolean)
      .join("\n");

  return (
    <CopyButtons
      size="sm"
      label={`${appName} v${snapshot.version_number}`}
      human={human}
      json={() => snapshot}
      agent={() => ({
        kind: "agent-app-version",
        location: `AI Matrx — Agent App — ${appName} — v${snapshot.version_number}`,
        description: "A single version snapshot record, including its code.",
        data: snapshot,
        summary: human(),
        attributes: {
          appId,
          version: snapshot.version_number,
          current: isCurrent,
        },
      })}
    />
  );
}
