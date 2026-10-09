"use client";

/**
 * AppletVersionsContent — /applets/manage/[id]/versions page body.
 *
 * The Applet's `app.definition_version` snapshots, newest first, each with a
 * one-line summary of what changed from the version before it and a Restore.
 * Restore writes that version's content (files, entry, pages, jobs, sources)
 * back onto the record — the snapshot trigger records it as a NEW version, so
 * nothing is lost and the version number only moves forward.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { Badge, Button } from "@ai-matrx/design-system/controls";
import { useAppDispatch } from "@/lib/redux/hooks";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast-service";
import { saveAppletRecord } from "@/features/agents/redux/applets/thunks";
import { appletFiles, appletJobs, appletPages, appletSources } from "@/features/applets/types";
import type { AppletVersionRow } from "@/lib/applets/data";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { appletVersionStatusLabel, type AppletStateFields } from "@/features/applets/lib/applet-state";
import { formatDateTime } from "@/features/applets/format";

interface AppletVersionsContentProps {
  appId: string;
  versions: AppletVersionRow[];
  currentVersion: number;
  /** The Applet's own state fields — the current version's badge says what the Applet is. */
  applet: AppletStateFields;
}

function versionHuman(v: AppletVersionRow, isCurrent: boolean, statusLabel: string | null): string {
  return [
    `v${v.version_number}${isCurrent ? " (current)" : ""}`,
    v.name,
    statusLabel ? `Status: ${statusLabel}` : null,
    `Changed: ${formatDateTime(v.changed_at)}`,
    v.change_note,
  ]
    .filter(Boolean)
    .join("\n");
}

/** What changed from `prev` to `v`, in a few words ("2 files changed, 1 page added"). */
function changeSummary(v: AppletVersionRow, prev: AppletVersionRow | undefined): string {
  if (!prev) return "First version";
  const parts: string[] = [];
  const fa = appletFiles(prev);
  const fb = appletFiles(v);
  const added = Object.keys(fb).filter((k) => !(k in fa)).length;
  const removed = Object.keys(fa).filter((k) => !(k in fb)).length;
  const changed = Object.keys(fb).filter((k) => k in fa && fa[k] !== fb[k]).length;
  const n = (count: number, noun: string, verb: string) =>
    count ? `${count} ${noun}${count === 1 ? "" : "s"} ${verb}` : null;
  parts.push(
    ...[n(added, "file", "added"), n(removed, "file", "removed"), n(changed, "file", "changed")].filter(
      (x): x is string => x !== null,
    ),
  );
  if (prev.entry !== v.entry) parts.push("entry changed");
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(appletPages(prev), appletPages(v))) parts.push("pages changed");
  if (!same(appletJobs(prev), appletJobs(v))) parts.push("jobs changed");
  if (!same(appletSources(prev), appletSources(v))) parts.push("data changed");
  if (prev.name !== v.name) parts.push("renamed");
  return parts.length ? parts.join(", ") : "No content change";
}

export function AppletVersionsContent({
  appId,
  versions,
  currentVersion,
  applet,
}: AppletVersionsContentProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [restoring, setRestoring] = useState<number | null>(null);

  const restore = async (v: AppletVersionRow) => {
    const ok = await confirm({
      title: `Restore v${v.version_number}?`,
      description: `Its files, pages, jobs and sources become the current Applet as a new version. v${currentVersion} stays in the list.`,
      confirmLabel: "Restore",
    });
    if (!ok) return;
    setRestoring(v.version_number);
    try {
      await dispatch(
        saveAppletRecord({
          appId,
          patch: { files: v.files, entry: v.entry, pages: v.pages, mandates: v.mandates, sources: v.sources },
        }),
      ).unwrap();
      toast.success(`Restored v${v.version_number}.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoring(null);
    }
  };

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
                  .map((v) => {
                    const isCurrent = v.version_number === currentVersion;
                    return versionHuman(v, isCurrent, appletVersionStatusLabel(isCurrent, applet, v.status));
                  })
                  .join("\n\n")
              }
              json={() => versions}
              agent={() => ({
                kind: "applet-versions",
                location: `AI Matrx — Applet — Versions`,
                description: "All version snapshots for this Applet.",
                data: versions,
                attributes: { appId, count: versions.length, currentVersion },
              })}
            />
          )}
        </div>

        {versions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No versions yet.
          </div>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border bg-card">
            {versions.map((v, i) => {
              const isCurrent = v.version_number === currentVersion;
              const statusLabel = appletVersionStatusLabel(isCurrent, applet, v.status);
              const summary = changeSummary(v, versions[i + 1]);
              return (
                <div key={v.id} className="group/x relative flex items-stretch">
                  <Link
                    href={`/applets/manage/${appId}/v/${v.version_number}`}
                    className="flex items-start gap-3 p-3 pr-40 flex-1 min-w-0 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-shrink-0 w-12 text-sm font-mono font-semibold text-foreground tabular-nums pt-0.5">
                      v{v.version_number}
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {v.name ?? "—"}
                        </span>
                        {/* ONE chip (audit M8): the current version is the Applet — its state is the header's —
                            so it says "Current"; an older row says the state its snapshot was saved in. */}
                        {isCurrent ? (
                          <Badge tone="primary">Current</Badge>
                        ) : statusLabel ? (
                          <Badge>{statusLabel}</Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {formatDateTime(v.changed_at)} · {summary}
                      </div>
                      {v.change_note && (
                        <p className="text-xs text-muted-foreground/90 italic">
                          {v.change_note}
                        </p>
                      )}
                    </div>
                  </Link>
                  {!isCurrent && (
                    <Button
                      variant="quiet"
                      icon={<RotateCcw />}
                      className="absolute right-14 top-1/2 -translate-y-1/2"
                      disabled={restoring !== null}
                      onClick={() => void restore(v)}
                    >
                      {restoring === v.version_number ? "Restoring…" : "Restore"}
                    </Button>
                  )}
                  <CopyButtons
                    size="icon"
                    label={`v${v.version_number}`}
                    className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover/x:opacity-100 focus-within:opacity-100"
                    human={() => versionHuman(v, isCurrent, statusLabel)}
                    json={() => v}
                    agent={() => ({
                      kind: "applet-version",
                      location: `AI Matrx — Applet — Versions`,
                      description: "A single version snapshot row.",
                      data: v,
                      summary: versionHuman(v, isCurrent, statusLabel),
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
