"use client";

/**
 * GroundingConsole — "no purpose, no build", made visible.
 *
 * Engram §4.5 says grounding debt is tracked like tech debt: visible,
 * prioritized, paid down deliberately. This is that surface. It reads the live
 * registry views (`platform.v_unit_purpose_coverage` /
 * `v_units_without_purpose` / `v_purpose_orphaned`) directly from Supabase —
 * never a committed snapshot, because the number's whole job is to be current.
 *
 * THE INVENTORY LAW, honoured: every primitive here already existed —
 * `getEntityInfo`/`tryGetEntityInfo` for the icon, label, and route;
 * `peekHref` semantics for "no detail route means no Open button, never a
 * button that 404s"; `ResourcePeekHost` for the peek; `MatrxDataTable` is
 * deliberately NOT used (these are two short, unsorted, unfiltered worklists,
 * not a records list). Nothing new was invented for the chrome.
 *
 * THE DOOR LAW, honoured: every unit named here is reachable — Open when the
 * registry knows a route, Peek always. A count is a door: the missing-purpose
 * number opens the units behind it.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResourcePeekHost } from "@/features/organizations/peek/ResourcePeekHost";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { isScopesRpcErr } from "@/features/scopes/types";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

import {
  purposeService,
  type GroundingTag,
  type OrphanedPurpose,
  type PurposeUnitType,
} from "../service";

type Rollup = {
  unitType: string;
  totalUnits: number;
  withPurpose: number;
  missingPurpose: number;
  groundingH: number;
  groundingV: number;
  groundingA: number;
};

type MissingUnit = {
  unitType: string;
  unitId: string;
  name: string | null;
};

const GROUNDING_LABEL: Record<GroundingTag, string> = {
  H: "Written by a person",
  V: "AI-drafted, person-verified",
  A: "AI only",
};

const GROUNDING_CLASS: Record<GroundingTag, string> = {
  H: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  V: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30",
  A: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
};

function GroundingBadge({ tag }: { tag: GroundingTag }) {
  return (
    <Badge variant="outline" className={cn("shrink-0 font-normal", GROUNDING_CLASS[tag])}>
      {tag} · {GROUNDING_LABEL[tag]}
    </Badge>
  );
}

/** One unit's row: always reachable — Open when a route exists, Peek always. */
function UnitRow({
  unitType,
  unitId,
  name,
  onPeek,
}: MissingUnit & { onPeek: (kind: string, id: string) => void }) {
  const info = tryGetEntityInfo(unitType);
  const href = info?.hrefFor?.(unitId);
  const Icon = info?.Icon;
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-sm last:border-b-0">
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
      <span className="min-w-0 flex-1 truncate">{name || "Untitled"}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{info?.label ?? unitType}</span>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
              onClick={() => onPeek(unitType, unitId)}>
        Peek
      </Button>
      {/* No `hrefFor` means the registry knows this kind has no detail route.
          Rendering no button is the honest state; a button that 404s is worse. */}
      {href ? (
        <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-xs">
          <a href={href} target="_blank" rel="noreferrer">Open</a>
        </Button>
      ) : null}
    </div>
  );
}

export function GroundingConsole() {
  const [rollups, setRollups] = useState<Rollup[]>([]);
  const [missing, setMissing] = useState<MissingUnit[]>([]);
  const [orphans, setOrphans] = useState<OrphanedPurpose[]>([]);
  const [openKind, setOpenKind] = useState<PurposeUnitType | null>(null);
  const [peek, setPeek] = useState<{ kind: string; id: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [cov, orph] = await Promise.all([
      purposeService.coverage(),
      purposeService.orphaned(),
    ]);
    if (isScopesRpcErr(cov)) toast.error(`Coverage: ${cov.error.message}`);
    else {
      // The view's grain is (unit kind, org); the platform total is what a
      // grounding-debt number means, so the orgs roll up here.
      const byKind = new Map<string, Rollup>();
      for (const c of cov.data) {
        const acc = byKind.get(c.unitType) ?? {
          unitType: c.unitType, totalUnits: 0, withPurpose: 0, missingPurpose: 0,
          groundingH: 0, groundingV: 0, groundingA: 0,
        };
        acc.totalUnits += c.totalUnits;
        acc.withPurpose += c.withPurpose;
        acc.missingPurpose += c.missingPurpose;
        acc.groundingH += c.groundingH;
        acc.groundingV += c.groundingV;
        acc.groundingA += c.groundingA;
        byKind.set(c.unitType, acc);
      }
      setRollups([...byKind.values()].sort((a, b) => a.unitType.localeCompare(b.unitType)));
    }
    if (isScopesRpcErr(orph)) toast.error(`Orphans: ${orph.error.message}`);
    else setOrphans(orph.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openMissing = useCallback(async (kind: PurposeUnitType) => {
    if (openKind === kind) {
      setOpenKind(null);
      return;
    }
    setOpenKind(kind);
    const res = await purposeService.unitsWithoutPurpose(kind);
    if (isScopesRpcErr(res)) toast.error(res.error.message);
    else setMissing(res.data);
  }, [openKind]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-textured">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <h1 className="text-sm font-semibold">Purpose &amp; grounding</h1>
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          Every unit of work declares what job it does. Units without one cannot be
          measured against their own purpose.
        </p>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rollups.map((r) => {
            const info = tryGetEntityInfo(r.unitType);
            const pct = r.totalUnits ? Math.round((r.withPurpose / r.totalUnits) * 100) : 0;
            return (
              <div key={r.unitType} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  {info?.Icon ? <info.Icon className="h-4 w-4 text-muted-foreground" /> : null}
                  <span className="text-sm font-medium">{info?.labelPlural ?? r.unitType}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{pct}% covered</span>
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">
                  {r.withPurpose}
                  <span className="text-base font-normal text-muted-foreground"> / {r.totalUnits}</span>
                </div>
                {/* A COUNT IS A DOOR — this opens the units behind the number. */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1 h-7 gap-1.5 px-2 text-xs text-amber-700 dark:text-amber-400"
                  onClick={() => void openMissing(r.unitType as PurposeUnitType)}
                  disabled={r.missingPurpose === 0}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {r.missingPurpose} without a purpose
                </Button>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(["H", "V", "A"] as const).map((tag) => {
                    const n = tag === "H" ? r.groundingH : tag === "V" ? r.groundingV : r.groundingA;
                    return n > 0 ? <GroundingBadge key={tag} tag={tag} /> : null;
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {openKind ? (
          <div className="mt-4 rounded-lg border border-border bg-card">
            <div className="border-b border-border px-3 py-2 text-sm font-medium">
              {tryGetEntityInfo(openKind)?.labelPlural ?? openKind} without a purpose
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                showing up to 200
              </span>
            </div>
            {missing.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">Nothing to show.</p>
            ) : (
              missing.map((u) => (
                <UnitRow key={`${u.unitType}:${u.unitId}`} {...u}
                         onPeek={(kind, id) => setPeek({ kind, id })} />
              ))
            )}
          </div>
        ) : null}

        <div className="mt-4 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Unplug className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Jobs nothing does anymore</span>
            <span className="text-xs text-muted-foreground">
              {orphans.length} purpose{orphans.length === 1 ? "" : "s"} with nothing attached
            </span>
          </div>
          {orphans.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Every purpose on record is served by something.
            </p>
          ) : (
            orphans.map((o) => (
              <div key={o.purposeId}
                   className="flex items-start gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{o.title}</div>
                  <div className="text-xs text-muted-foreground">{o.statement}</div>
                </div>
                <GroundingBadge tag={o.groundingTag} />
              </div>
            ))
          )}
          <p className="px-3 py-2 text-xs text-muted-foreground">
            These are kept on purpose. The job outlives the unit that used to do it —
            an unserved job is a finding, not litter.
          </p>
        </div>
      </div>

      <ResourcePeekHost
        kind={peek?.kind ?? ""}
        id={peek?.id ?? null}
        onClose={() => setPeek(null)}
      />
    </div>
  );
}
