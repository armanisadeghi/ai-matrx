"use client";

// features/masterwork/components/masterworks/MasterworkDriftDialog.tsx
//
// "What changed since this Masterwork was built" — the other half of the drift
// flag. A badge saying "built from v3" while the Rulebook sits at v7 tells the
// Expert something is stale but not WHAT, which is a dead end: a comparison
// must state the verdict, not a timestamp. This opens the rule-level answer —
// rules gained, rules retired, rules whose wording moved under the
// Masterwork's feet.
//
// Data: the Rulebook as it was at the Masterwork's version comes from
// `public.rulebook_snapshot` over history.row_versions (the platform-wide
// version capture the Rulebook table was enrolled in on 2026-08-16), diffed
// against the live rules by the pure `rulebookDiff` module. A version older
// than capture has NO snapshot — we say exactly that instead of inventing a
// diff.

import { useEffect, useState } from "react";
import { ArrowRight, GitCompare, MinusCircle, PlusCircle, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { SEVERITY_LABELS, type RulebookRule } from "../../types";
import { diffRules, FIELD_LABELS, type RulebookDiff } from "../../rulebookDiff";
import { getRulebookSnapshotRules } from "../../service";

function RuleLine({ rule }: { rule: RulebookRule }) {
  return (
    <div className="rounded border border-border/70 bg-muted/30 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-foreground">
          {rule.name || rule.id}
        </span>
        <Badge variant="outline" className="px-1 py-0 text-[10px]">
          {SEVERITY_LABELS[rule.severity] ?? rule.severity}
        </Badge>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{rule.statement}</p>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </p>
      {children}
    </div>
  );
}

export function MasterworkDriftDialog({
  open,
  onOpenChange,
  rulebookId,
  masterworkName,
  masterworkVersion,
  currentVersion,
  currentRules,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebookId: string;
  masterworkName: string;
  /** The Rulebook version this Masterwork was built from (metadata.rulebook_version). */
  masterworkVersion: number;
  /** The Rulebook's version right now. */
  currentVersion: number;
  /** The Rulebook's live rules — already loaded by the Masterworks page. */
  currentRules: RulebookRule[];
}) {
  const [loading, setLoading] = useState(false);
  const [diff, setDiff] = useState<RulebookDiff | null>(null);
  const [noSnapshot, setNoSnapshot] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNoSnapshot(false);
    setDiff(null);
    getRulebookSnapshotRules(rulebookId, masterworkVersion)
      .then((snapshot) => {
        if (cancelled) return;
        if (snapshot === null) {
          setNoSnapshot(true);
          return;
        }
        setDiff(diffRules(snapshot, currentRules));
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Could not load what this Rulebook looked like then.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, rulebookId, masterworkVersion, currentRules]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            What changed since “{masterworkName}” was built
          </DialogTitle>
          <DialogDescription>
            Comparing the rules this Masterwork was built from (version{" "}
            {masterworkVersion}) with the rules in the Rulebook now (version{" "}
            {currentVersion}). Only rules a Masterwork actually enforces are
            counted — drafts waiting for your approval are listed separately.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-destructive">{error}</p>
        ) : noSnapshot ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No record of version {masterworkVersion} was kept — this Rulebook
            was edited before we started saving a copy of every version (16
            August 2026). Every version from now on is recorded, so the next
            change will show here rule by rule. Rebuilding the Masterwork will
            bring it to version {currentVersion}.
          </p>
        ) : diff ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              {diff.driftCount === 0
                ? "Nothing this Masterwork enforces has changed."
                : `${diff.driftCount} change${diff.driftCount === 1 ? "" : "s"} to the rules this Masterwork enforces. Rebuild the Masterwork to adopt them.`}
            </p>

            {diff.added.length > 0 ? (
              <Section
                icon={<PlusCircle className="h-3.5 w-3.5" />}
                title={`${diff.added.length} rule${diff.added.length === 1 ? "" : "s"} the Masterwork doesn't have yet`}
              >
                <div className="space-y-1.5">
                  {diff.added.map((rule) => (
                    <RuleLine key={rule.id} rule={rule} />
                  ))}
                </div>
              </Section>
            ) : null}

            {diff.removed.length > 0 ? (
              <Section
                icon={<MinusCircle className="h-3.5 w-3.5" />}
                title={`${diff.removed.length} rule${diff.removed.length === 1 ? "" : "s"} the Masterwork still enforces but you've retired`}
              >
                <div className="space-y-1.5">
                  {diff.removed.map((rule) => (
                    <RuleLine key={rule.id} rule={rule} />
                  ))}
                </div>
              </Section>
            ) : null}

            {diff.changed.length > 0 ? (
              <Section
                icon={<PencilLine className="h-3.5 w-3.5" />}
                title={`${diff.changed.length} rule${diff.changed.length === 1 ? "" : "s"} reworded`}
              >
                <div className="space-y-1.5">
                  {diff.changed.map((rule) => (
                    <div
                      key={rule.id}
                      className="rounded border border-border/70 bg-muted/30 px-2 py-1.5"
                    >
                      <p className="text-xs font-medium text-foreground">
                        {rule.name}
                      </p>
                      <div className="mt-1 space-y-1">
                        {rule.changes.map((change) => (
                          <div key={change.field} className="text-xs">
                            <span className="text-muted-foreground">
                              {FIELD_LABELS[change.field]}:{" "}
                            </span>
                            <span className="text-muted-foreground line-through">
                              {change.before || "(empty)"}
                            </span>
                            <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />
                            <span className="text-foreground">
                              {change.after || "(empty)"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            ) : null}

            {diff.pendingDrafts.length > 0 ? (
              <p className="rounded border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                {diff.pendingDrafts.length} draft rule
                {diff.pendingDrafts.length === 1 ? "" : "s"} are waiting for
                your approval on the Rulebook page. Masterworks ignore drafts,
                so approving them is what turns them into drift worth
                rebuilding for.
              </p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
