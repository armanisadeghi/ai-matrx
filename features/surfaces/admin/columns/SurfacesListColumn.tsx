"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Layers, Layers3, Search, Link2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/styles/themes/utils";
import {
  makeSelectBindingsForAgent,
  selectActiveSurfaces,
  selectSurfacesError,
  selectSurfacesStatus,
} from "@/features/surfaces/redux/selectors";
import {
  loadBindingsForAgent,
  loadSurfaces,
} from "@/features/surfaces/redux/thunks";
import type { SurfaceWithStats } from "@/features/surfaces/services/surfaces.service";
import { useSurfacesAdminSelection } from "../useSurfacesAdminSelection";

function splitSurfaceName(fullName: string): { client: string; local: string } {
  const idx = fullName.indexOf("/");
  if (idx < 0) return { client: "", local: fullName };
  return { client: fullName.slice(0, idx), local: fullName.slice(idx + 1) };
}

function prettifyLocal(local: string): string {
  return local
    .split(/[-_]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function prettifyClient(client: string): string {
  return client
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type BindingFilter = "all" | "bound" | "unbound";
type SetupFilter = "all" | "setup" | "not-setup";

function isSurfaceSetUp(surface: SurfaceWithStats): boolean {
  return surface.surfaceValueCount > 0;
}

function emptyListMessage(
  bindingFilter: BindingFilter,
  setupFilter: SetupFilter,
): string {
  if (bindingFilter !== "all" && setupFilter !== "all") {
    return "No surfaces match these filters";
  }
  if (bindingFilter === "bound") return "No bound surfaces yet";
  if (bindingFilter === "unbound") return "Every surface is bound";
  if (setupFilter === "setup") return "No set-up surfaces yet";
  if (setupFilter === "not-setup") return "Every surface is set up";
  return "No surfaces match";
}

interface UrlMatch {
  segments: string[];
}

/**
 * Parse the search query. If it looks like a URL or pathname, return its
 * path segments; the row matcher then prefers surfaces whose local-name
 * tokens overlap with any path segment.
 *
 * This is the string-fallback path; once `ui_surface.url_pattern` lands
 * in the schema we'll do exact pattern matching first and fall back to
 * this for non-canonical pastes.
 */
function parseUrlQuery(raw: string): UrlMatch | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const looksLikeUrl =
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/");
  if (!looksLikeUrl) return null;
  try {
    const u = trimmed.startsWith("/")
      ? new URL(trimmed, "https://placeholder.local")
      : new URL(trimmed);
    const segments = u.pathname
      .split("/")
      .map((s) => s.toLowerCase())
      .filter((s) => s.length > 0 && !looksLikeUuid(s));
    if (segments.length === 0) return null;
    return { segments };
  } catch {
    return null;
  }
}

function looksLikeUuid(segment: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    segment,
  );
}

function surfaceMatchesUrl(surface: SurfaceWithStats, url: UrlMatch): boolean {
  const { local, client } = splitSurfaceName(surface.name);
  const tokens = [...local.split(/[-_]/g), ...client.split(/[-_/]/g)]
    .map((t) => t.toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return false;
  return url.segments.some((seg) => tokens.includes(seg));
}

/**
 * Column 1 — Surfaces.
 *
 * Sectioned by `client_name`; default collapsed. Bound surfaces (for the
 * current agent) are visually distinct, and counts strips + Bound /
 * Unbound and Set up / Not set up filters make it easy to focus.
 *
 * Search accepts a plain substring or a pasted URL. URL pastes try to
 * locate the surface that owns that route — string-match for now, a
 * `url_pattern` column will make this deterministic.
 */
export function SurfacesListColumn({
  agentId,
  basePath = "/agents",
}: {
  agentId: string;
  /** Base path for the Batch link. `/agents` for core; admin passes its
   *  system-agents base so the batch route stays in the admin shell. */
  basePath?: string;
}) {
  const dispatch = useAppDispatch();
  const surfaces = useAppSelector(selectActiveSurfaces);
  const status = useAppSelector(selectSurfacesStatus);
  const error = useAppSelector(selectSurfacesError);
  const selectBindings = useMemo(
    () => makeSelectBindingsForAgent(agentId),
    [agentId],
  );
  const bindings = useAppSelector(selectBindings);
  const { surfaceName: selectedSurface, selectSurface } =
    useSurfacesAdminSelection();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BindingFilter>("all");
  const [setupFilter, setSetupFilter] = useState<SetupFilter>("all");

  useEffect(() => {
    void dispatch(loadSurfaces());
  }, [dispatch]);

  useEffect(() => {
    void dispatch(loadBindingsForAgent({ agentId }));
  }, [dispatch, agentId]);

  const boundSet = useMemo(() => {
    const s = new Set<string>();
    for (const b of bindings) s.add(b.surfaceName);
    return s;
  }, [bindings]);

  const boundCount = useMemo(
    () => surfaces.filter((s) => boundSet.has(s.name)).length,
    [surfaces, boundSet],
  );
  const unboundCount = surfaces.length - boundCount;

  const setupCount = useMemo(
    () => surfaces.filter(isSurfaceSetUp).length,
    [surfaces],
  );
  const notSetupCount = surfaces.length - setupCount;

  const groups = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const urlQuery = parseUrlQuery(query);

    const passesSearch = (s: SurfaceWithStats) => {
      if (!trimmed) return true;
      if (urlQuery) {
        // URL-style query: try URL match first, then fall back to a
        // straight substring so a URL whose surface we can't infer
        // still has *some* signal.
        if (surfaceMatchesUrl(s, urlQuery)) return true;
      }
      const local = splitSurfaceName(s.name).local.toLowerCase();
      return (
        local.includes(trimmed) ||
        s.client_name.toLowerCase().includes(trimmed) ||
        (s.description?.toLowerCase().includes(trimmed) ?? false)
      );
    };

    const passesBindingFilter = (s: SurfaceWithStats) => {
      if (filter === "all") return true;
      const isBound = boundSet.has(s.name);
      return filter === "bound" ? isBound : !isBound;
    };

    const passesSetupFilter = (s: SurfaceWithStats) => {
      if (setupFilter === "all") return true;
      const setUp = isSurfaceSetUp(s);
      return setupFilter === "setup" ? setUp : !setUp;
    };

    const filtered = surfaces.filter(
      (s) => passesSearch(s) && passesBindingFilter(s) && passesSetupFilter(s),
    );

    const grouped = new Map<string, SurfaceWithStats[]>();
    for (const s of filtered) {
      const list = grouped.get(s.client_name) ?? [];
      list.push(s);
      grouped.set(s.client_name, list);
    }
    return Array.from(grouped.entries())
      .map(([client, list]) => ({
        client,
        surfaces: list.sort((a, b) => {
          // Within matrx-default, the singleton "default" surface goes
          // first so it reads as the headline starting point.
          if (client === "matrx-default") {
            if (a.name === "matrx-default/default") return -1;
            if (b.name === "matrx-default/default") return 1;
          }
          return splitSurfaceName(a.name).local.localeCompare(
            splitSurfaceName(b.name).local,
          );
        }),
      }))
      .sort((a, b) => {
        // matrx-default is the user's defaults home — always at the top.
        if (a.client === "matrx-default") return -1;
        if (b.client === "matrx-default") return 1;
        return a.client.localeCompare(b.client);
      });
  }, [surfaces, query, filter, setupFilter, boundSet]);

  const isSearching = query.trim().length > 0;
  const isUrlSearch = parseUrlQuery(query) !== null;

  return (
    <div className="h-full flex flex-col bg-muted/50 pt-[var(--shell-header-h)]">
      {/* Title block */}
      <div className="shrink-0 px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Layers className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground leading-none">
              Surfaces
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {surfaces.length} active
            </div>
          </div>
          <Link
            href={`${basePath}/${agentId}/surfaces/batch`}
            title="Bind many surfaces at once"
            className={cn(
              "ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-md px-2 py-1",
              "text-xs font-medium border border-border bg-background",
              "text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors",
            )}
          >
            <Layers3 className="h-3.5 w-3.5" />
            Batch
          </Link>
        </div>

        {/* Counts strip */}
        <div className="space-y-1 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
                {boundCount}
              </span>{" "}
              bound
            </span>
            <span aria-hidden className="opacity-50">
              ·
            </span>
            <span>
              <span className="font-medium text-foreground/80 tabular-nums">
                {unboundCount}
              </span>{" "}
              unbound
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>
              <span className="font-medium text-sky-700 dark:text-sky-400 tabular-nums">
                {setupCount}
              </span>{" "}
              set up
            </span>
            <span aria-hidden className="opacity-50">
              ·
            </span>
            <span>
              <span className="font-medium text-foreground/80 tabular-nums">
                {notSetupCount}
              </span>{" "}
              not set up
            </span>
          </div>
        </div>

        {/* Binding filter pills */}
        <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
          {(["all", "bound", "unbound"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "flex-1 px-2 py-1 rounded text-[11px] font-medium capitalize transition-colors",
                filter === f
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Setup filter pills */}
        <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
          {(
            [
              { id: "all", label: "All" },
              { id: "setup", label: "Set up" },
              { id: "not-setup", label: "Not set up" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSetupFilter(id)}
              className={cn(
                "flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors",
                setupFilter === id
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          {isUrlSearch ? (
            <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary" />
          ) : (
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          )}
          <Input
            placeholder="Search or paste a URL"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={cn(
              "h-9 pl-8 text-sm bg-background",
              isUrlSearch && "border-primary/40",
            )}
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto pb-4">
        {status === "loading" && surfaces.length === 0 && (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            Loading surfaces…
          </div>
        )}
        {error && (
          <div className="mx-4 my-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        {status !== "loading" && groups.length === 0 && (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">
            {emptyListMessage(filter, setupFilter)}
          </div>
        )}

        <div className="px-2 space-y-1">
          {groups.map((group) => (
            <ClientSection
              key={group.client}
              client={group.client}
              surfaces={group.surfaces}
              forceOpen={isSearching}
              selectedSurface={selectedSurface}
              onSelect={selectSurface}
              boundSet={boundSet}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ClientSection({
  client,
  surfaces,
  forceOpen,
  selectedSurface,
  onSelect,
  boundSet,
}: {
  client: string;
  surfaces: SurfaceWithStats[];
  forceOpen: boolean;
  selectedSurface: string | null;
  onSelect: (name: string) => void;
  boundSet: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const isOpen = open || forceOpen;
  const boundInGroup = surfaces.filter((s) => boundSet.has(s.name)).length;

  return (
    <section className="rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left",
          "hover:bg-accent/60 transition-colors",
          isOpen && "bg-accent/40",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground truncate">
            {prettifyClient(client)}
          </div>
        </div>
        {boundInGroup > 0 && (
          <span
            className="shrink-0 inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-medium tabular-nums bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
            title={`${boundInGroup} bound in this group`}
          >
            {boundInGroup}
          </span>
        )}
        <span className="shrink-0 inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-medium tabular-nums bg-background text-muted-foreground border border-border">
          {surfaces.length}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform shrink-0",
            !isOpen && "-rotate-90",
          )}
        />
      </button>

      {isOpen && (
        <ul className="mt-1 mb-2 pl-2 space-y-0.5">
          {surfaces.map((s) => {
            const { local } = splitSurfaceName(s.name);
            const isActive = s.name === selectedSurface;
            const isBound = boundSet.has(s.name);
            return (
              <li key={s.name}>
                <button
                  type="button"
                  onClick={() => onSelect(s.name)}
                  className={cn(
                    "group relative w-full text-left rounded-md px-3 py-2",
                    "transition-colors",
                    isActive
                      ? "bg-primary/10 text-foreground"
                      : isBound
                        ? "bg-emerald-500/5 hover:bg-emerald-500/10 text-foreground/90"
                        : "hover:bg-accent/60 text-foreground/85",
                  )}
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary"
                    />
                  )}
                  {!isActive && isBound && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-emerald-500/70"
                    />
                  )}
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={cn(
                        "text-sm font-medium truncate min-w-0 flex-1",
                        isActive && "text-foreground",
                      )}
                    >
                      {prettifyLocal(local)}
                    </div>
                    {isBound && (
                      <span className="shrink-0 inline-flex items-center px-1.5 h-4 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                        Bound
                      </span>
                    )}
                  </div>
                  {s.surfaceValueCount > 0 && (
                    <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                      {s.surfaceValueCount} value
                      {s.surfaceValueCount === 1 ? "" : "s"}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
