"use client";

// features/masterwork/components/detail/RulebookVersionHistory.tsx
//
// THE DOOR ON THE VERSION BADGE.
//
// `v6` beside a Rulebook's name was an identifier the Expert could not open —
// exactly the dead end THE DOOR LAW names. The version log already existed
// (`listRulebookVersions` → the `rulebook_versions` RPC over
// history.row_versions) and had no UI at all. This popover is that UI: click
// the badge, see every version, who changed it, and how many rules it had.
//
// Read-only on purpose. Rolling back to a version is a different, destructive
// action and is not smuggled into a history list.

import { useCallback, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  listRulebookVersions,
  type RulebookVersionEntry,
} from "@/features/masterwork/service";

/** What actually happened, in Expert words rather than DB words. */
const OPERATION_LABELS: Record<string, string> = {
  INSERT: "Created",
  UPDATE: "Edited",
  DELETE: "Deleted",
};

/**
 * Who made the change — provenance is already stamped on every row
 * (`actor_tier`), so say it plainly instead of showing a raw id.
 */
const TIER_LABELS: Record<string, string> = {
  human: "by a person",
  ai: "by AI",
  code: "by the system",
};

export interface RulebookVersionHistoryProps {
  rulebookId: string;
  version: number;
}

export function RulebookVersionHistory({
  rulebookId,
  version,
}: RulebookVersionHistoryProps) {
  const [entries, setEntries] = useState<RulebookVersionEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (open: boolean) => {
      if (!open || entries !== null || loading) return;
      setLoading(true);
      setError(null);
      listRulebookVersions(rulebookId)
        .then(setEntries)
        .catch((err: unknown) =>
          setError(
            err instanceof Error
              ? err.message
              : "Couldn't load this Rulebook's history.",
          ),
        )
        .finally(() => setLoading(false));
    },
    [rulebookId, entries, loading],
  );

  return (
    <Popover onOpenChange={load}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Version ${version} — see every version`}
          title="See every version of this Rulebook"
        >
          <Badge
            variant="outline"
            className="cursor-pointer px-1.5 py-0 text-[10px] hover:border-primary/40 hover:text-foreground"
          >
            v{version}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">
            Every version
          </span>
        </div>
        <div className="max-h-72 overflow-y-auto px-3 py-2">
          {loading ? (
            <p className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Reading the history…
            </p>
          ) : error ? (
            <p className="py-2 text-xs text-destructive">{error}</p>
          ) : entries && entries.length > 0 ? (
            <ul className="space-y-1.5">
              {entries.map((entry) => (
                <li
                  key={`${entry.version}-${entry.occurred_at}`}
                  className="flex items-baseline gap-2 text-xs"
                >
                  <span className="w-8 shrink-0 font-medium text-foreground">
                    v{entry.version}
                  </span>
                  <span className="text-muted-foreground">
                    {OPERATION_LABELS[entry.operation] ?? entry.operation}
                    {entry.actor_tier
                      ? ` ${TIER_LABELS[entry.actor_tier] ?? ""}`
                      : ""}{" "}
                    · {entry.rule_count}{" "}
                    {entry.rule_count === 1 ? "rule" : "rules"}
                  </span>
                  <span className="ml-auto shrink-0 text-muted-foreground">
                    {new Date(entry.occurred_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-xs text-muted-foreground">
              {/* Rulebooks created before 2026-08-16 predate version capture —
                  say so rather than implying nothing ever happened. */}
              No version history recorded for this Rulebook yet.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
