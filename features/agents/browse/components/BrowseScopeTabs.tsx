"use client";

// features/agents/browse/components/BrowseScopeTabs.tsx
//
// THE VIEW LAW made visible: the fixed five destinations, each a different
// question, each with a TRUE server-side count.
//
// The surface declares WHICH of the five it supports (`scopes` prop) — it
// cannot invent a sixth, and a scope the user learns here means the same thing
// on every other list page. Agents declares four; Industry appears the moment
// a feature grows an industry grant table.
//
// Why "My Orgs" (and Industry) is ONE tab with a dropdown rather than a chip
// per entity, the shape components/official/ListScopeSwitcher uses today: a
// user belongs to a personal org + N companies and may attach several
// industries. A chip-per-entity tab bar has unbounded width and offers no
// blended view, so it answers "which team?" before "what does my team have?".

import { User, Building2, Users2, Globe, Factory, ChevronDown, Check } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAllOrgs } from "@/features/agent-context/redux/organizationsSlice";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  makeScope,
  scopeIndustryId,
  scopeOrgId,
  type ListScope,
  type ListScopeKind,
} from "@/lib/list-scope/types";
import type { EntityScopeCounts } from "@/lib/entity-list/types";

interface Props {
  scope: ListScope;
  /** Which of the fixed five this surface supports, in display order. */
  scopes: ListScopeKind[];
  counts: EntityScopeCounts;
  onChange: (scope: ListScope) => void;
}

const TAB_BASE =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 h-7 text-xs font-medium transition-colors whitespace-nowrap";
const TAB_ACTIVE = "bg-primary text-primary-foreground";
const TAB_IDLE = "text-muted-foreground hover:bg-muted hover:text-foreground";

const SCOPE_META: Record<
  ListScopeKind,
  { label: string; icon: typeof User; title?: string }
> = {
  mine: { label: "Mine", icon: User, title: "Records you created" },
  orgs: {
    label: "My Orgs",
    icon: Building2,
    title: "Created by teammates in organizations you belong to",
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
};

/** Scopes that narrow via a dropdown rather than being a single destination. */
const NARROWABLE: Partial<Record<ListScopeKind, "byOrg" | "byIndustry">> = {
  orgs: "byOrg",
  industry: "byIndustry",
};

function CountPill({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1 text-[10px] font-semibold tabular-nums",
        active ? "bg-primary-foreground/20" : "bg-muted-foreground/15",
      )}
    >
      {n}
    </span>
  );
}

export function BrowseScopeTabs({ scope, scopes, counts, onChange }: Props) {
  const orgs = useAppSelector(selectAllOrgs);
  // Personal org is excluded on purpose: its contents ARE "Mine". Surfacing it
  // again under My Orgs would double-count the same rows in two tabs.
  const teamOrgs = orgs.filter((o) => !o.is_personal);

  const narrowOptions = (kind: ListScopeKind) =>
    kind === "orgs"
      ? teamOrgs.map((o) => ({ id: o.id, name: o.name }))
      : /* industry options arrive when a feature wires the scope */ [];

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1"
      role="tablist"
      aria-label="List scope"
    >
      {scopes.map((kind) => {
        const meta = SCOPE_META[kind];
        const Icon = meta.icon;
        const narrowKey = NARROWABLE[kind];
        const options = narrowKey ? narrowOptions(kind) : [];
        const active = scope.kind === kind;

        // The id this tab is currently narrowed to, if any. Read through the
        // typed helpers — never by string-splitting the scope key.
        const narrowedId = !active
          ? null
          : kind === "orgs"
            ? scopeOrgId(scope)
            : kind === "industry"
              ? scopeIndustryId(scope)
              : null;
        const narrowedName = narrowedId
          ? options.find((o) => o.id === narrowedId)?.name
          : undefined;

        const count = narrowedId
          ? (counts[narrowKey!]?.[narrowedId] ?? 0)
          : (counts.byKind[kind] ?? 0);

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
            {narrowedName ?? meta.label}
            <CountPill n={count} active={active} />
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
                    "rounded-l-none border-l px-1",
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
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {counts.byKind[kind] ?? 0}
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
                      <span className="truncate">{opt.name}</span>
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {counts[narrowKey!]?.[opt.id] ?? 0}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}
