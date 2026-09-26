"use client";

// lib/scoped-config/KnobHistoryPopover.tsx
//
// The per-row "History" affordance every settings row carries (KnobOverrideRow).
// Reads `platform.knob_history` for THIS row's rung plus the platform rung, and
// offers "Revert to this" on entries at this rung — the revert is handed back to
// the row, which writes it through the SAME door a normal save uses, so a revert
// is itself one more history row and passes the same permission gate.

import { useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { extractErrorMessage } from "@/utils/errors";
import { doorLabel, fetchKnobHistory, type KnobHistoryEntry } from "./history";
import type { KnobScopeKindName } from "./types";

function when(at: string): string {
  const date = new Date(at);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function KnobHistoryPopover(props: {
  feature: string;
  key_: string;
  label: string;
  /** null = the system register (platform rung only). */
  organizationId: string | null;
  scopeKind: KnobScopeKindName | "platform";
  scopeId: string | null;
  canRevert: boolean;
  /** The row's own formatter, so a choice is said in words and a voice by name. */
  displayValue: (value: unknown) => string;
  /** Write `value` through the row's door; `null` removes this rung's own value. */
  onRevert: (value: unknown) => Promise<boolean>;
}) {
  const { feature, key_, label, organizationId, scopeKind, scopeId, canRevert, displayValue, onRevert } = props;
  const [entries, setEntries] = useState<KnobHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(
        await fetchKnobHistory({
          feature,
          key: key_,
          organizationId,
          scopeKind: scopeKind === "platform" ? null : scopeKind,
          scopeId: scopeKind === "platform" ? null : scopeId,
        }),
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const revert = async (entry: KnobHistoryEntry) => {
    const target = entry.action === "clear" ? null : entry.new_value;
    const ok = await confirm({
      title: `Revert ${label}?`,
      description:
        target === null
          ? scopeKind === "platform"
            ? "The platform value returns to its registered default. Every organization without its own value follows it."
            : "This value is removed here, and the setting follows the level above it again."
          : `${label} becomes ${displayValue(target)} again, as it was set on ${when(entry.at)}. The change is recorded in this history.`,
      confirmLabel: "Revert",
    });
    if (!ok) return;
    if (await onRevert(target)) await load();
  };

  return (
    <Popover onOpenChange={(open) => open && void load()}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`History of ${label}`}
          title="History"
          className="h-9 w-9 shrink-0"
        >
          <History className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent sizing="content" align="end" className="w-[22rem] max-w-[90vw] p-0 text-xs">
        <div className="border-b border-border px-3 py-2 font-medium">History — {label}</div>
        <div className="max-h-80 overflow-y-auto">
          {loading && entries === null ? (
            <p className="px-3 py-3 text-muted-foreground">Reading the change history…</p>
          ) : error ? (
            <p className="px-3 py-3 text-destructive">The history could not be read: {error}</p>
          ) : !entries || entries.length === 0 ? (
            <p className="px-3 py-3 text-muted-foreground">
              No changes recorded. It has held its current value since the settings history started.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((entry) => {
                const otherRung = !entry.is_this_rung;
                const rungWord =
                  entry.scope_kind === "platform"
                    ? "Platform value"
                    : entry.scope_kind === "platform_default"
                      ? "Registered default"
                      : null;
                const verb =
                  entry.action === "clear"
                    ? `Removed (was ${displayValue(entry.old_value)})`
                    : entry.action === "rung_lock" || entry.action === "rung_unlock"
                      ? entry.action === "rung_lock"
                        ? "Personal overrides turned off"
                        : "Personal overrides allowed"
                      : entry.old_value === null || entry.old_value === undefined
                        ? `Set to ${displayValue(entry.new_value)}`
                        : `${displayValue(entry.old_value)} → ${displayValue(entry.new_value)}`;
                const revertable =
                  canRevert &&
                  !otherRung &&
                  (entry.action === "set" || entry.action === "update" || entry.action === "clear");
                return (
                  <li key={entry.id} className="space-y-1 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words font-medium text-foreground [overflow-wrap:anywhere]">
                        {rungWord && otherRung ? <span className="text-muted-foreground">{rungWord}: </span> : null}
                        {verb}
                      </p>
                      {revertable && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 shrink-0 gap-1 px-2 text-xs"
                          onClick={() => void revert(entry)}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Revert to this
                        </Button>
                      )}
                    </div>
                    <p className="text-muted-foreground">
                      {when(entry.at)} · {entry.actor_name ?? "System"} · {doorLabel(entry.door)}
                    </p>
                    {entry.set_note ? <p className="text-muted-foreground">{entry.set_note}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
