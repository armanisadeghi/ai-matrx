"use client";

/**
 * SurfaceMandatesSection — "the AI doing jobs here", inside the Agents menu.
 *
 * 🚨 THE DISCLOSURE LAW (Arman, 2026-08-25): "on any surface where an agent is
 * actually being assigned but built into the physical UI … we also add that
 * agent to the list of available agents at the top", and "for any mandates
 * that are declared and related to the page, we're also going to include those
 * in here … especially because of the parent-child relationship. So that if
 * I'm in the podcast system, I should be able to see somewhere in that drop
 * down that there are mandates related to podcasts, and clicking them should
 * take me there."
 *
 * Two sources, one list, no third registry:
 *   • DECLARED — `SurfaceManifest.agentRoles[].mandateKey` on this surface AND
 *     on its family (ancestry + children, the same registry walk that draws the
 *     breadcrumb above). This is why standing anywhere in podcast shows the
 *     podcast family's mandates.
 *   • LIVE — what the page disclosed at runtime through `<PageAgents>` /
 *     `useDeclaredSurfaceMandates`, for surfaces that pick their mandate from
 *     live state (the run console runs a different one per engine).
 *
 * Every row is a DOOR (no-dead-ends): it opens the mandate console, where the
 * pinned agent, its instructions, its bindings and its history live. Admins
 * additionally get the notes composer in place — feedback is worth most in the
 * second you notice something, not at the end of a trip to another screen.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  StickyNote,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getManifest } from "@/features/surfaces/manifests/registry";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";
import { useLiveSurfaceMandates } from "@/features/surfaces/runtime/surface-mandates";
import {
  fetchMandateIdentities,
  type MandateIdentity,
} from "@/features/agents/mandates/service";
import { MandateNotesPanel } from "@/features/agents/mandates/components/MandateNotesPanel";

export interface SurfaceMandatesSectionProps {
  /** The surface the user is standing on. */
  primarySurfaceName: string | null;
  /** Family surface names — ancestry + children, from the registry. */
  familySurfaceNames: readonly string[];
  isAdmin: boolean;
  className?: string;
}

interface MandateRow {
  mandateKey: string;
  /** What it does HERE — the role's label, or the page's own wording. */
  does: string;
  /** `self` = runs on this page. `family` = a related surface's job. */
  relation: "self" | "family";
  /** For family rows: which surface declares it. */
  fromSurfaceName: string | null;
}

/** Admins repair mandates in the console; everyone else picks their agent. */
function mandateHref(mandateKey: string, isAdmin: boolean): string {
  const key = encodeURIComponent(mandateKey);
  return isAdmin
    ? `/administration/agents/mandates?mandate=${key}`
    : `/agents/mandates?feature=${key}`;
}

function collectRows(
  primarySurfaceName: string | null,
  familySurfaceNames: readonly string[],
  live: readonly { mandateKey: string; does: string }[],
): MandateRow[] {
  const byKey = new Map<string, MandateRow>();

  const addRolesOf = (surfaceName: string, relation: "self" | "family") => {
    const manifest = getManifest(surfaceName);
    for (const role of manifest?.agentRoles ?? []) {
      if (!role.mandateKey) continue;
      const existing = byKey.get(role.mandateKey);
      // A job that runs HERE always outranks the same job listed as family.
      if (existing && !(existing.relation === "family" && relation === "self"))
        continue;
      byKey.set(role.mandateKey, {
        mandateKey: role.mandateKey,
        does: role.label,
        relation,
        fromSurfaceName: relation === "family" ? surfaceName : null,
      });
    }
  };

  if (primarySurfaceName) addRolesOf(primarySurfaceName, "self");
  for (const name of familySurfaceNames) addRolesOf(name, "family");

  // Live disclosure wins the wording — the page said what it actually runs.
  for (const ref of live) {
    byKey.set(ref.mandateKey, {
      mandateKey: ref.mandateKey,
      does: ref.does,
      relation: "self",
      fromSurfaceName: null,
    });
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.relation !== b.relation) return a.relation === "self" ? -1 : 1;
    return a.mandateKey.localeCompare(b.mandateKey);
  });
}

export function SurfaceMandatesSection({
  primarySurfaceName,
  familySurfaceNames,
  isAdmin,
  className,
}: SurfaceMandatesSectionProps) {
  const live = useLiveSurfaceMandates();
  const rows = collectRows(primarySurfaceName, familySurfaceNames, live);
  const [identities, setIdentities] = useState<
    Record<string, MandateIdentity>
  >({});
  const [openNotesFor, setOpenNotesFor] = useState<string | null>(null);

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

  if (rows.length === 0) return null;

  return (
    <div className={cn("min-w-0 border-b border-border pb-2", className)}>
      <div className="mb-1 flex items-center gap-1">
        <BrainCircuit
          className="h-3 w-3 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          AI doing jobs here
        </span>
      </div>
      <ul className="min-w-0 space-y-1">
        {rows.map((row) => {
          const identity = identities[row.mandateKey];
          const notesOpen = openNotesFor === row.mandateKey;
          return (
            <li key={row.mandateKey} className="min-w-0">
              <div className="flex min-w-0 items-start gap-1">
                <Link
                  href={mandateHref(row.mandateKey, isAdmin)}
                  title={`Open ${row.mandateKey} — the agent, its instructions and its bindings`}
                  className="group min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-xs font-medium text-foreground">
                      {identity?.label ?? row.mandateKey}
                    </span>
                    {row.relation === "family" && row.fromSurfaceName && (
                      <span className="shrink-0 rounded border border-border px-1 text-[9px] text-muted-foreground">
                        {getSurfaceDisplayLabel(row.fromSurfaceName)}
                      </span>
                    )}
                    {identity && !identity.isEnabled && (
                      <span className="shrink-0 rounded border border-amber-500/40 px-1 text-[9px] text-amber-600 dark:text-amber-400">
                        off
                      </span>
                    )}
                    <ExternalLink className="ml-auto h-2.5 w-2.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {row.does}
                  </span>
                  <span className="block truncate font-mono text-[9px] text-muted-foreground/70">
                    {row.mandateKey}
                  </span>
                </Link>
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
    </div>
  );
}
