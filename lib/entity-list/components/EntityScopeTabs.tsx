"use client";

// lib/entity-list/components/EntityScopeTabs.tsx
//
// THE VIEW LAW made visible: the fixed destinations, each a different
// question, each with a TRUE server-side count.
//
// The surface declares WHICH of them it supports (`scopes` prop) — it cannot
// invent one of its own, and a scope the user learns here means the same thing
// on every other list page. Agents declares four, plus System for a Matrx
// admin; Industry appears the moment a feature grows an industry grant table.
//
// A scope may be CONDITIONAL on who is looking (System is admin-only). That
// decision belongs to the page, which can read auth state — it passes the
// resolved list down. This component never gates anything itself.
//
// A LANE NEVER NARROWS TO AN ORGANIZATION (Arman 2026-09-30). Which
// organization a list shows is the page's organization filter — its own
// control at the right end of this row (`EntityOrgFilter`), narrowing every
// lane at once. The only in-tab narrowing left is a lane's OWN axis: Industry
// (which industry) and the admin support lanes (which organization / person
// the platform is being looked into). Those options (names AND counts) come
// from the counts query, never from a Redux slice.

import {
  Layers,
  User,
  UsersRound,
  Building2,
  Users2,
  Globe,
  Factory,
  Landmark,
  ChevronDown,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTriggerLegacy as SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import {
  makeScope,
  withStandardLanes,
  scopeIndustryId,
  scopeNarrowId,
  type LaneSupport,
  type ListScope,
  type ListScopeKind,
} from "@/lib/list-scope/types";
import type { EntityScopeCounts } from "@/lib/entity-list/types";

export interface EntityScopeTabsProps {
  scope: ListScope;
  /** Which of the fixed lanes this surface supports, in display order (All / My team are added here). */
  scopes: ListScopeKind[];
  counts: EntityScopeCounts;
  /**
   * 🚨 "NOT COUNTED YET" IS NOT "ZERO" (Masterwork cold walk 5, finding 6).
   * The rows and the scope counts are fetched by two independent effects, so a
   * list that paints before its counts land showed a populated shelf under a
   * tab whose own badge read `0` — the screen contradicting itself, in the same
   * paint, over the same records. A count this component has not been given is
   * shown as nothing at all, never as a number nobody measured.
   */
  countsLoading?: boolean;
  /**
   * Render EXACTLY `scopes` — no All / My team added. Only for a standalone
   * host whose reader cannot answer those lanes; a list on a `*_list_scoped`
   * RPC never sets it.
   */
  exact?: boolean;
  /** The lanes the surface's type can never hold (`EntityListConfig.lanes`); absent, not empty. */
  lanes?: LaneSupport;
  /**
   * A narrow host (a side panel) whose width is a phone's at every screen size: the lanes are
   * the one select at every width, never a tab row that scrolls out of sight.
   */
  compact?: boolean;
  onChange: (scope: ListScope) => void;
}

/** Lanes with an axis of their own to narrow by, inside the tab. */
const LANE_NARROWS: ReadonlySet<ListScopeKind> = new Set([
  "industry",
  "platform_orgs",
  "platform_users",
]);

const TAB_BASE =
  "matrx-glyph-trim inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap";
const TAB_ACTIVE = "bg-primary text-primary-foreground";
const TAB_IDLE = "text-muted-foreground hover:bg-muted hover:text-foreground";

const SCOPE_META: Record<
  ListScopeKind,
  { label: string; icon: typeof User; title?: string }
> = {
  all: {
    label: "All",
    icon: Layers,
    title: "Everything that is yours to see: Mine, My team, My Orgs and Shared",
  },
  mine: { label: "Mine", icon: User, title: "Records you created" },
  team: {
    label: "My team",
    icon: UsersRound,
    title: "Made by you and the people you share a team with",
  },
  orgs: {
    label: "My Orgs",
    icon: Building2,
    title: "In the organizations you belong to",
  },
  shared: {
    label: "Shared",
    icon: Users2,
    title: "Shared with you directly or with one of your organizations",
  },
  industry: {
    label: "Industry",
    icon: Factory,
    title: "Published for industries your organizations have attached",
  },
  public: { label: "Public", icon: Globe, title: "Published platform-wide" },
  system: {
    label: "System",
    icon: Landmark,
    title: "Built into the platform by Matrx",
  },
  // ── Admin platform scopes (never a personal seat) ──
  platform_orgs: {
    label: "Organizations",
    icon: Building2,
    title: "Every organization's records — narrow to one organization",
  },
  platform_users: {
    label: "Users",
    icon: User,
    title: "Every person's own records — narrow to one person",
  },
  platform_all: {
    label: "All",
    icon: Globe,
    title: "The whole platform: system, organizations and people",
  },
};

/** A lane's tab label ("Mine", "My Orgs", …) — the words the tab bar shows. */
export function scopeKindLabel(kind: ListScopeKind): string {
  return SCOPE_META[kind]?.label ?? kind;
}

function CountPill({ n, active, pending }: { n: number | null; active: boolean; pending: boolean }) {
  // Counted nothing and not reading (a failed or unknowable count): no pill, never a stand-in forever.
  if (n === null && !pending) return null;
  // ONE FIXED-WIDTH SLOT (STABLE-2, /data home: the lane tabs widened 36px each when their counts
  // landed): the pill is three digits wide PLUS its own px-1 (border-box: 3ch alone left 3 digits 8px wider) before the number is real and after, so a count arriving
  // moves nothing. Absent, never dishonest: until the number is real the slot is an empty shape,
  // no digit in it.
  return (
    <span
      data-scope-count={n === null ? "pending" : "ready"}
      aria-hidden={n === null ? true : undefined}
      className={cn(
        "inline-block min-w-[calc(3ch+0.5rem)] rounded px-1 text-center type-meta font-semibold tabular-nums",
        active ? "bg-primary-foreground/20" : "bg-muted-foreground/15",
        n === null && "animate-pulse",
      )}
    >
      {/* a non-breaking space keeps the pill the line's height while it waits */}
      {n === null ? "\u00a0" : n}
    </span>
  );
}

export function EntityScopeTabs({
  scope,
  scopes,
  counts,
  countsLoading,
  exact = false,
  lanes,
  compact = false,
  onChange,
}: EntityScopeTabsProps) {
  // A LANE IS NEVER CLIPPED (coordinator, /agents/all beside the chat panel 2026-10-04: "My Orgs"
  // cut mid-word under "Any dimension", Shared / Public / System gone). The tab row is measured at
  // its natural width against the slot it sits in; when it does not fit, the SAME slot holds the
  // capsule select ("All 236 ▾") and the row stays mounted, invisible and inert, only to be measured
  // (so the answer cannot oscillate as the layout flips). Never a row that scrolls or fades its tabs.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [fits, setFits] = useState(true);
  useEffect(() => {
    const box = boxRef.current;
    const row = rowRef.current;
    if (!box || !row || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      if (row.offsetParent === null && getComputedStyle(row).display === "none") return;
      const next = row.scrollWidth <= box.clientWidth + 1;
      setFits((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(row);
    return () => observer.disconnect();
  }, [scopes.length, compact]);
  const kinds = exact ? [...scopes] : withStandardLanes(scopes, { lanes });
  // Only a lane's OWN axis narrows inside its tab; organizations are the org filter's.
  const narrowOptions = (kind: ListScopeKind) =>
    LANE_NARROWS.has(kind) ? (counts.narrow[kind] ?? []) : [];
  // Control-type rule: up to four choices are pills, more are a select. On a
  // phone five or more scope tabs never fit (at 375 /transcripts showed two of
  // five, "Shared" and "Public" past the edge), so the SAME slot holds a
  // select there; wider screens keep the tabs.
  const phoneSelect = kinds.length >= 5;
  // The select stands in whenever the row does not fit, at any width.
  const selectEverywhere = compact || !fits;
  const activeNarrowId =
    scope.kind === "industry" ? scopeIndustryId(scope) : scopeNarrowId(scope);
  const countOf = (kind: ListScopeKind): number | null => {
    const measured = counts.byKind[kind];
    // A count nobody has measured for THE CURRENT filter is nothing — never the previous filter's number.
    if (countsLoading || counts.uncounted) return null;
    return typeof measured === "number" ? measured : 0;
  };
  const withCount = (label: string, n: number | null) => (n === null ? label : `${label} (${n})`);
  return (
    <div ref={boxRef} data-entity-scope-lanes={selectEverywhere ? "select" : "tabs"} className="relative w-full min-w-0">
    {(phoneSelect || selectEverywhere) && (
      <Select
        value={activeNarrowId ? `${scope.kind}:${activeNarrowId}` : scope.kind}
        onValueChange={(v) => {
          const at = v.indexOf(":");
          onChange(at === -1 ? makeScope(v as ListScopeKind) : makeScope(v.slice(0, at) as ListScopeKind, v.slice(at + 1)));
        }}
      >
        <SelectTrigger aria-label="List scope" className={cn("h-7 w-auto min-w-0 max-w-full gap-1.5 text-xs", !selectEverywhere && "sm:hidden")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {kinds.map((kind) => {
            const meta = SCOPE_META[kind];
            const Icon = meta.icon;
            const options = narrowOptions(kind);
            const item = (
              <SelectItem key={kind} value={kind}>
                <span className="inline-flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {withCount(options.length > 0 ? `${meta.label} — all` : meta.label, countOf(kind))}
                </span>
              </SelectItem>
            );
            if (options.length === 0) return item;
            return (
              <SelectGroup key={kind}>
                <SelectLabel className="text-xs">{meta.label}</SelectLabel>
                {item}
                {options.map((opt) => (
                  <SelectItem key={`${kind}:${opt.id}`} value={`${kind}:${opt.id}`}>
                    <span className="truncate">{withCount(opt.label, opt.count)}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
    )}
    <div
      ref={rowRef}
      aria-hidden={selectEverywhere && !compact ? true : undefined}
      inert={selectEverywhere && !compact ? true : undefined}
      // No box around the tabs: the active tab's fill is the whole signal
      // (a bordered box around them read as box-in-box, 2026-09-27).
      // Labels stay on a phone (page-pass 2026-09-27: icon + count alone left
      // "which one is Mine?" to guesswork); a row too wide for the screen
      // scrolls sideways instead of dropping its words.
      className={cn(
        // The padding (cancelled by the negative margin) holds each tab's
        // touch ring INSIDE this scroll box (.matrx-tap-ring, app/globals.css,
        // which keeps a tablist's rings to the tab's own width): without it the
        // ring overflowed, the strip scrolled and faded its only tab on a phone.
        "pointer-coarse:-my-2 pointer-coarse:py-2 inline-flex max-w-full min-w-0 items-center gap-0.5 overflow-hidden sm:gap-1 [&>*]:shrink-0",
        phoneSelect && !selectEverywhere && "max-sm:hidden",
        compact && "hidden",
        // Measured, never shown: out of flow, invisible, inert.
        selectEverywhere && !compact && "pointer-events-none invisible absolute left-0 top-0 max-w-none",
      )}
      role="tablist"
      aria-label="List scope"
    >
      {/* "All" and "My team" join every tab bar that offers them — here, once. */}
      {kinds.map((kind) => {
        const meta = SCOPE_META[kind];
        const Icon = meta.icon;
        const options = narrowOptions(kind);
        const active = scope.kind === kind;

        // The id this tab is currently narrowed to, if any. Read through the
        // typed helpers — never by string-splitting the scope key.
        const narrowedId = !active
          ? null
          : kind === "industry"
            ? scopeIndustryId(scope)
            : scopeNarrowId(scope);
        const narrowed = narrowedId
          ? options.find((o) => o.id === narrowedId)
          : undefined;

        const measured = narrowed?.count ?? counts.byKind[kind];
        const count = countsLoading || counts.uncounted
          ? null
          : typeof measured === "number"
            ? measured
            : 0;

        const tab = (
          <button
            type="button"
            role="tab"
            aria-selected={active}
            title={meta.title}
            className={cn(
              TAB_BASE,
              active ? TAB_ACTIVE : TAB_IDLE,
              options.length > 0 && "rounded-r-none pr-1.5",
            )}
            onClick={() => onChange(makeScope(kind))}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="whitespace-nowrap">
              {narrowed?.label ?? meta.label}
            </span>
            <CountPill n={count} active={active} pending={Boolean(countsLoading)} />
          </button>
        );

        if (options.length === 0) {
          return <div key={kind}>{tab}</div>;
        }

        return (
          <div key={kind} className="inline-flex items-center">
            {tab}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Filter by ${meta.label}`}
                  className={cn(
                    TAB_BASE,
                    "justify-center rounded-l-none border-l px-1",
                    active
                      ? "bg-primary text-primary-foreground border-primary-foreground/25"
                      : cn(TAB_IDLE, "border-border"),
                  )}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56">
                <DropdownMenuLabel className="text-xs">
                  {meta.label}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => onChange(makeScope(kind))}
                  className="justify-between"
                >
                  <span className="flex items-center gap-2">
                    {active && !narrowedId ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <span className="w-3.5" />
                    )}
                    All
                  </span>
                  <span className="type-secondary tabular-nums text-muted-foreground">
                    {counts.uncounted ? null : (counts.byKind[kind] ?? 0)}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {options.map((opt) => (
                  <DropdownMenuItem
                    key={opt.id}
                    onSelect={() => onChange(makeScope(kind, opt.id))}
                    className="justify-between"
                  >
                    <span className="flex items-center gap-2 truncate">
                      {narrowedId === opt.id ? (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
                      <span className="truncate">{opt.label}</span>
                    </span>
                    <span className="type-secondary tabular-nums text-muted-foreground">
                      {opt.count}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
    </div>
  );
}
