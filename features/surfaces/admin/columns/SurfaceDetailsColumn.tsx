"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Database,
  Eye,
  Hash,
  List,
  ToggleLeft,
  Type,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { loadSurfaceValues } from "@/features/surfaces/redux/thunks";
import {
  makeSelectSurfaceValues,
  makeSelectSurfaceValuesStatus,
  selectAllSurfaces,
} from "@/features/surfaces/redux/selectors";
import type { SurfaceValue } from "@/features/surfaces/types";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import { useSurfacesAdminSelection } from "../useSurfacesAdminSelection";
import { SurfaceRolesSection } from "./SurfaceRolesSection";

const TYPE_ICONS: Record<
  SurfaceValue["valueType"],
  React.ComponentType<{ className?: string }>
> = {
  string: Type,
  number: Hash,
  boolean: ToggleLeft,
  object: Database,
  array: List,
};

function splitSurfaceName(fullName: string): { client: string; local: string } {
  const idx = fullName.indexOf("/");
  if (idx < 0) return { client: "", local: fullName };
  return { client: fullName.slice(0, idx), local: fullName.slice(idx + 1) };
}

function prettifySurfaceLocal(fullName: string): string {
  const { local } = splitSurfaceName(fullName);
  return local
    .split(/[-_]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Column 4 — Surface details.
 *
 * Header: just the pretty surface name (no description duplicated from the
 * binding column, no client slash-path). Rows: pretty value name, an
 * Always / Sometimes presence tag (always one of the two — never an
 * orphan "Always" with no opposite), and a subtle type marker. Clicking
 * a row expands it inline to reveal the full description plus any
 * remaining technical fields.
 */
export function SurfaceDetailsColumn({ agent }: { agent: AgentDefinition }) {
  const dispatch = useAppDispatch();
  const { surfaceName } = useSurfacesAdminSelection();
  const allSurfaces = useAppSelector(selectAllSurfaces);

  const selectValues = useMemo(
    () => makeSelectSurfaceValues(surfaceName ?? ""),
    [surfaceName],
  );
  const selectValuesStatus = useMemo(
    () => makeSelectSurfaceValuesStatus(surfaceName ?? ""),
    [surfaceName],
  );
  const values = useAppSelector(selectValues);
  const status = useAppSelector(selectValuesStatus);

  useEffect(() => {
    if (!surfaceName) return;
    void dispatch(loadSurfaceValues({ surfaceName }));
  }, [dispatch, surfaceName]);

  const surface = useMemo(() => {
    if (!surfaceName) return null;
    return allSurfaces.find((s) => s.name === surfaceName) ?? null;
  }, [allSurfaces, surfaceName]);

  if (!surfaceName) {
    return (
      <div className="h-full bg-muted/50 pt-[var(--shell-header-h)]">
        <div className="px-4 pt-4 pb-2">
          <SectionTitle />
        </div>
        <p className="px-4 text-xs text-muted-foreground italic">
          Pick a surface to see its declared values.
        </p>
      </div>
    );
  }

  const sortedValues = [...values].sort((a, b) => {
    const orderA = a.sortOrder ?? 0;
    const orderB = b.sortOrder ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="h-full flex flex-col bg-muted/50 pt-[var(--shell-header-h)]">
      <SurfaceRolesSection surfaceName={surfaceName} agent={agent} />

      {/* Header — name only, plus counts */}
      <header className="shrink-0 mx-3 mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Eye className="h-3.5 w-3.5" />
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Surface
          </div>
        </div>
        <h2 className="text-base font-semibold text-foreground leading-tight">
          {prettifySurfaceLocal(surfaceName)}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            <span className="font-medium text-foreground tabular-nums">
              {values.length}
            </span>{" "}
            value{values.length === 1 ? "" : "s"}
          </span>
          {surface && (
            <>
              <span aria-hidden className="opacity-50">
                ·
              </span>
              <span>
                <span className="font-medium text-foreground tabular-nums">
                  {surface.agentCount}
                </span>{" "}
                agent{surface.agentCount === 1 ? "" : "s"}
              </span>
              <span aria-hidden className="opacity-50">
                ·
              </span>
              <span>
                <span className="font-medium text-foreground tabular-nums">
                  {surface.toolCount}
                </span>{" "}
                tool{surface.toolCount === 1 ? "" : "s"}
              </span>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto px-3 pt-3 pb-4">
        {status === "loading" && values.length === 0 && (
          <div className="px-1 py-2 text-xs text-muted-foreground">
            Loading values…
          </div>
        )}
        {status !== "loading" && sortedValues.length === 0 && (
          <div className="px-1 py-3 text-xs text-muted-foreground italic">
            This surface declares no values yet.
          </div>
        )}
        <ul className="space-y-2">
          {sortedValues.map((v) => (
            <SurfaceValueCard key={v.name} value={v} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function SectionTitle() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Eye className="h-3.5 w-3.5" />
      </div>
      <div className="text-sm font-semibold text-foreground">Surface</div>
    </div>
  );
}

function SurfaceValueCard({ value }: { value: SurfaceValue }) {
  const [open, setOpen] = useState(false);
  const Icon = TYPE_ICONS[value.valueType] ?? Type;
  const display = value.label || formatVariableDisplayName(value.name);

  return (
    <li>
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent/30 transition-colors"
        >
          <div className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground/70">
            <Icon className="h-3 w-3" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground truncate">
              {display}
            </div>
          </div>
          <PresenceTag alwaysAvailable={value.alwaysAvailable} />
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0",
              !open && "-rotate-90",
            )}
          />
        </button>

        {open && (
          <div className="px-3 pt-2 pb-3 border-t border-border bg-muted/20 space-y-2 text-xs">
            {value.description ? (
              <p className="text-foreground/85 leading-relaxed">
                {value.description}
              </p>
            ) : (
              <p className="text-muted-foreground italic">
                No description provided.
              </p>
            )}
            <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1 pt-1">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Type
              </dt>
              <dd className="text-foreground/80">{value.valueType}</dd>
              {value.typicalCharCount != null && (
                <>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Typical size
                  </dt>
                  <dd className="text-foreground/80 tabular-nums">
                    {value.typicalCharCount.toLocaleString()} chars
                  </dd>
                </>
              )}
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Sort order
              </dt>
              <dd className="text-foreground/80 tabular-nums">
                {value.sortOrder}
              </dd>
            </dl>
          </div>
        )}
      </div>
    </li>
  );
}

function PresenceTag({ alwaysAvailable }: { alwaysAvailable: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center px-1.5 h-5 rounded text-[10px] font-medium",
        alwaysAvailable
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
      title={
        alwaysAvailable
          ? "The surface always supplies this value"
          : "The surface only sometimes supplies this value"
      }
    >
      {alwaysAvailable ? "Always" : "Sometimes"}
    </span>
  );
}
