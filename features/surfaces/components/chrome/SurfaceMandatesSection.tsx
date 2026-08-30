"use client";

/**
 * SurfaceMandatesSection — "the AI doing jobs here", inside the Agents menu.
 *
 * 🚨 THE DISCLOSURE LAW (Arman, 2026-08-25): "on any surface where an agent is
 * actually being assigned but built into the physical UI … we also add that
 * agent to the list of available agents at the top".
 *
 * Two sources, one list, no third registry:
 *   • DECLARED — `SurfaceManifest.agentRoles[].mandateKey` on THIS surface.
 *   • LIVE — what the page registered through UI-free
 *     `useDeclaredSurfaceMandates`, for surfaces that pick an existing fixed
 *     job from live state (the run console runs a different one per engine).
 *
 * This top-menu section is the ONLY disclosure UI. Registration must never add
 * chips, labels, rows, rosters, or explanatory content to the working surface.
 *
 * Every row is a DOOR (no-dead-ends), and the door opens IN PLACE: the
 * `mandateWindow` panel over this page — the pinned agent, your own binding,
 * the admin workbench and the notes, without losing the surface you are
 * standing on (Arman, 2026-08-26). A `<Link>` to a mandate route from here is a
 * regression. The sticky-note button stays for one-breath capture without even
 * opening the window.
 *
 * 🚨 THIRD SOURCE — DISCOVERED (census #16, THE-MODEL law 3). The two sources
 * above are what this page ASSIGNED. They are not the whole truth about what
 * the page can do: any portable item whose consumed surface values all resolve
 * here is ALSO available, by the same derived gate the context menu runs
 * (`features/surfaces/runtime/available-here.ts` → `decideOffer`). Disclosing
 * only the assigned half was the disclosure law answering half a question.
 * Discovered rows are collapsed by default and never mix with the assigned
 * list — they are a capability statement, not a roster.
 */

import { useEffect, useState } from "react";
import {
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Sparkles,
  StickyNote,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getManifest } from "@/features/surfaces/manifests/registry";
import { useLiveSurfaceMandates } from "@/features/surfaces/runtime/surface-mandates";
import { useAvailableHere } from "@/features/surfaces/runtime/available-here";
import {
  fetchMandateIdentities,
  type MandateIdentity,
} from "@/features/mandates/service";
import { MandateNotesPanel } from "@/features/mandates/components/MandateNotesPanel";
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";

export interface SurfaceMandatesSectionProps {
  /** The surface the user is standing on. */
  primarySurfaceName: string | null;
  isAdmin: boolean;
  /** Called after a mandate window opens, so the host popover can close. */
  onOpened?: () => void;
  className?: string;
}

interface MandateRow {
  mandateKey: string;
  /** What it does HERE — the role's label, or the page's own wording. */
  does: string;
}

function collectRows(
  primarySurfaceName: string | null,
  live: readonly { mandateKey: string; does: string }[],
): MandateRow[] {
  const byKey = new Map<string, MandateRow>();

  const addRolesOf = (surfaceName: string) => {
    const manifest = getManifest(surfaceName);
    for (const role of manifest?.agentRoles ?? []) {
      if (!role.mandateKey) continue;
      byKey.set(role.mandateKey, {
        mandateKey: role.mandateKey,
        does: role.label,
      });
    }
  };

  if (primarySurfaceName) addRolesOf(primarySurfaceName);

  // Live disclosure wins the wording — the page said what it actually runs.
  for (const ref of live) {
    byKey.set(ref.mandateKey, {
      mandateKey: ref.mandateKey,
      does: ref.does,
    });
  }

  return [...byKey.values()].sort((a, b) =>
    a.mandateKey.localeCompare(b.mandateKey),
  );
}

export function SurfaceMandatesSection({
  primarySurfaceName,
  isAdmin,
  onOpened,
  className,
}: SurfaceMandatesSectionProps) {
  const live = useLiveSurfaceMandates();
  const openMandate = useOpenMandateWindow();
  const rows = collectRows(primarySurfaceName, live);
  const [identities, setIdentities] = useState<
    Record<string, MandateIdentity>
  >({});
  const [openNotesFor, setOpenNotesFor] = useState<string | null>(null);
  const [discoveredOpen, setDiscoveredOpen] = useState(false);
  // THE DERIVED HALF (#16). Same gate as the context menu — never a second one.
  const discovered = useAvailableHere({ surfaceName: primarySurfaceName });

  const keyList = rows.map((row) => row.mandateKey).join("|");
  useEffect(() => {
    const keys = keyList ? keyList.split("|") : [];
    if (keys.length === 0) return;
    let cancelled = false;
    // ONE batched read for every key in the menu — never one per row.
    fetchMandateIdentities(keys)
      .then((next) => {
        if (!cancelled) setIdentities(next);
      })
      .catch((err: unknown) => {
        // Listing survives without labels; the failure is still loud.
        console.error("[surface-mandates] identity read failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [keyList]);

  if (rows.length === 0 && discovered.available.length === 0) return null;

  return (
    <div className={cn("min-w-0 border-b border-border pb-2", className)}>
      {rows.length > 0 && (
        <div className="mb-1 flex items-center gap-1">
          <BrainCircuit
            className="h-3 w-3 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            AI doing jobs here
          </span>
        </div>
      )}
      <ul className="min-w-0 space-y-1">
        {rows.map((row) => {
          const identity = identities[row.mandateKey];
          const notesOpen = openNotesFor === row.mandateKey;
          return (
            <li key={row.mandateKey} className="min-w-0">
              <div className="flex min-w-0 items-start gap-1">
                <button
                  type="button"
                  onClick={() => {
                    openMandate({
                      initialMandateKey: row.mandateKey,
                      mandateKeys: rows.map((entry) => entry.mandateKey),
                      surfaceName: primarySurfaceName,
                      initialView: isAdmin ? "admin" : "yours",
                    });
                    onOpened?.();
                  }}
                  title={`Open ${row.mandateKey} — the agent, its instructions, your binding and its notes`}
                  className="group min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-xs font-medium text-foreground">
                      {identity?.label ?? row.mandateKey}
                    </span>
                    {identity && !identity.isEnabled && (
                      <span className="shrink-0 rounded border border-amber-500/40 px-1 text-[9px] text-amber-600 dark:text-amber-400">
                        off
                      </span>
                    )}
                    <Maximize2 className="ml-auto h-2.5 w-2.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {row.does}
                  </span>
                  <span className="block truncate font-mono text-[9px] text-muted-foreground/70">
                    {row.mandateKey}
                  </span>
                </button>
                {isAdmin && identity && (
                  <button
                    type="button"
                    onClick={() =>
                      setOpenNotesFor(notesOpen ? null : row.mandateKey)
                    }
                    title={
                      notesOpen
                        ? "Hide notes"
                        : "Notes & observations for this mandate"
                    }
                    aria-expanded={notesOpen}
                    className="mt-0.5 flex shrink-0 items-center gap-0.5 rounded-md border border-border px-1.5 py-1 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    <StickyNote className="h-3 w-3" />
                    {notesOpen ? (
                      <ChevronDown className="h-2.5 w-2.5" />
                    ) : (
                      <ChevronRight className="h-2.5 w-2.5" />
                    )}
                  </button>
                )}
              </div>
              {isAdmin && identity && notesOpen && (
                <MandateNotesPanel
                  compact
                  className="mt-1 rounded-md border border-border bg-muted/30 p-2"
                  mandateId={identity.mandateId}
                  mandateKey={row.mandateKey}
                  surfaceName={primarySurfaceName}
                  observedAgentId={identity.defaultAgentId}
                />
              )}
            </li>
          );
        })}
      </ul>

      {/* DISCOVERED — what this page CAN run, by the derived gate. Collapsed:
          it answers "what else is possible here", which is a question, not a
          roster, and the assigned list above must stay the loud one. */}
      {discovered.available.length > 0 && (
        <div className={cn("min-w-0", rows.length > 0 && "mt-2 border-t border-border pt-2")}>
          <button
            type="button"
            onClick={() => setDiscoveredOpen((open) => !open)}
            aria-expanded={discoveredOpen}
            title="Portable AI whose required page values all resolve here — availability is capability"
            className="flex w-full min-w-0 items-center gap-1 text-left text-[9px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              Also available here ({discovered.available.length})
            </span>
            {discoveredOpen ? (
              <ChevronDown className="ml-auto h-2.5 w-2.5 shrink-0" />
            ) : (
              <ChevronRight className="ml-auto h-2.5 w-2.5 shrink-0" />
            )}
          </button>
          {discoveredOpen && (
            <>
              <ul className="mt-1 min-w-0 space-y-0.5">
                {discovered.available.map((item) => (
                  <li
                    key={item.id}
                    className="min-w-0 rounded-md border border-border/60 bg-muted/20 px-2 py-1"
                    title={
                      item.requirements.length > 0
                        ? `Needs: ${item.requirements.join(", ")} — all readable here`
                        : "Needs nothing from this page"
                    }
                  >
                    <span className="block truncate text-[11px] text-foreground">
                      {item.label}
                    </span>
                    <span className="block truncate text-[9px] text-muted-foreground">
                      {item.requirements.length > 0
                        ? item.requirements.join(" · ")
                        : "no page values required"}
                    </span>
                  </li>
                ))}
              </ul>
              {/* 🚨 LOUD, COUNTED, VISIBLE — the half of census #16 that is
                  NOT delivered. Per-row coverage state needs the row's mandate
                  identity, and `mandate_key` reaches these rows only when
                  SHORTCUT_STORAGE_CUTOVER flips. An empty badge column would
                  read as "covered"; this sentence reads as what it is. */}
              {discovered.withoutMandateIdentity > 0 && (
                <p className="mt-1 text-[9px] leading-snug text-amber-600 dark:text-amber-400">
                  {discovered.withoutMandateIdentity} of these carry no mandate
                  identity on the active storage, so coverage state cannot be
                  shown for them yet (shortcut storage cutover is OFF).
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
