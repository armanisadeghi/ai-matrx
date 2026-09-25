"use client";

/**
 * MandateWindowNext — the NEW mandate window, registered beside the old
 * `MandateWindow` (untouched) so the owner can compare them
 * (common-docs/systems/mandates/UI-REGISTER.md item 6b, line by line).
 *
 * Shape:
 *   • SIDEBAR (the panel's own) lists EVERY mandate the viewer can see, never
 *     one lonely item: All | Mine | My Orgs | System, search, the selected one
 *     highlighted, a feature name (pretty) under each.
 *   • HEADER: the mandate's name, once, plus one icon that opens its full page
 *     in a new browser tab (distinct from the panel's own pop-out control).
 *   • BODY: one row of tabs (short labels) over the SAME tab bodies the record
 *     page mounts (`MandateRecordBody`). No "Yours / Admin" toggle — a super
 *     admin simply sees the admin tabs too.
 *   • FOOTER: the export menu, the only control.
 *   • URL: `?panels=mandate_next:<mandate key>` — reload reopens this mandate.
 *
 * 🚨 A PANEL WRAPS THE CANONICAL COMPONENT: the body is the record page's body,
 * not a second renderer.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Search, SquareArrowOutUpRight } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useUserOrganizations } from "@/features/organizations/hooks";
import {
  fetchMandateConsoleData,
  type MandateDefinitionRow,
} from "@/features/mandates/admin/service";
import { onMandateCacheInvalidated } from "@/features/mandates/service";
import { splitMandateKey } from "@/features/mandates/mandate-key";
import { mandateDisplayName } from "@/features/mandates/mandate-words";
import { mandateRoute } from "@/features/mandates/browse/types";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { cn } from "@/lib/utils";
import { MandateRecordBody } from "@/features/mandates/record-next/MandateRecordBody";
import { RecordTabStrip } from "@/features/mandates/record-next/RecordTabStrip";
import {
  mandateRecordPreviewHref,
  parseRecordTab,
  visibleRecordTabs,
  type RecordTabId,
} from "@/features/mandates/record-next/record-tabs";

export interface MandateWindowNextProps {
  isOpen?: boolean;
  onClose?: () => void;
  initialMandateKey?: string | null;
  initialTab?: string | null;
}

type Scope = "all" | "mine" | "orgs" | "system";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "orgs", label: "My Orgs" },
  { id: "system", label: "System" },
];

/** Exclusive buckets: System = homed in the system org; Mine = I created it. */
function scopeOf(row: MandateDefinitionRow, userId: string | null): Exclude<Scope, "all"> {
  if ((row.organization_id ?? "").toLowerCase() === SYSTEM_ORGANIZATION_ID.toLowerCase()) {
    return "system";
  }
  if (userId && row.created_by === userId) return "mine";
  return "orgs";
}

export default function MandateWindowNext(props: MandateWindowNextProps) {
  if (props.isOpen === false) return null;
  return <MandateWindowNextInner {...props} />;
}

function MandateWindowNextInner({
  onClose,
  initialMandateKey,
  initialTab,
}: MandateWindowNextProps) {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const userId = useAppSelector(selectUserId);
  const { organizations } = useUserOrganizations();
  const [rows, setRows] = useState<MandateDefinitionRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialMandateKey ?? null,
  );
  const [tab, setTab] = useState<RecordTabId>(() =>
    parseRecordTab(initialTab, true),
  );
  const [scope, setScope] = useState<Scope>("all");
  const [search, setSearch] = useState("");
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Every mandate the viewer can see: the platform's plus every org they
    // are in (the one list door, `ALL_HOMES`). Any mandate write anywhere
    // re-reads it (the same bus the console and the old window use).
    const read = () => {
      fetchMandateConsoleData()
        .then((next) => {
          if (cancelled) return;
          setRows(next.mandates);
          setLoadError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          console.error("[mandate-window-next] load failed", err);
          setLoadError(
            err instanceof Error ? err.message : "Could not load mandates.",
          );
        });
    };
    read();
    const off = onMandateCacheInvalidated(read);
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const orgNames = new Map(organizations.map((o) => [o.id, o.name]));
  const orgName = (id: string | null) => (id ? (orgNames.get(id) ?? null) : null);

  const counts: Record<Scope, number> = { all: 0, mine: 0, orgs: 0, system: 0 };
  for (const row of rows ?? []) {
    counts.all += 1;
    counts[scopeOf(row, userId)] += 1;
  }

  const query = search.trim().toLowerCase();
  const visible = (rows ?? [])
      .filter((row) => scope === "all" || scopeOf(row, userId) === scope)
      .filter((row) => {
        if (!query) return true;
        const feature = splitMandateKey(row.mandate_key).feature;
        return [
          mandateDisplayName(row.mandate_key, row.label),
          formatVariableDisplayName(feature),
          row.mandate_key,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) =>
        mandateDisplayName(a.mandate_key, a.label).localeCompare(
          mandateDisplayName(b.mandate_key, b.label),
        ),
      );

  // Selection is DERIVED: the chosen key when it exists, else the first row.
  const selected =
    (rows ?? []).find((row) => row.mandate_key === selectedKey) ??
    visible[0] ??
    null;
  const selectedName = selected
    ? mandateDisplayName(selected.mandate_key, selected.label)
    : "Mandates";
  const fullPageHref = selected
    ? isSuperAdmin
      ? mandateRecordPreviewHref(selected.mandate_key, tab)
      : mandateRoute({ mandate_key: selected.mandate_key })
    : null;

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-1.5 border-b border-border px-2 py-1.5">
        <div
          role="tablist"
          aria-label="Whose mandates"
          className="flex items-center gap-0.5 rounded-md bg-muted/60 p-0.5"
        >
          {SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={scope === s.id}
              title={rows ? `${counts[s.id]} ${counts[s.id] === 1 ? "mandate" : "mandates"}` : undefined}
              onClick={() => setScope(s.id)}
              className={cn(
                "flex-1 whitespace-nowrap rounded px-1 py-0.5 text-[10.5px] font-medium transition-colors",
                scope === s.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a mandate"
            aria-label="Find a mandate"
            className="h-7 w-full rounded-md border border-border bg-background pl-6 pr-2 text-xs outline-none focus:border-primary/50"
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 space-y-px p-1">
        {visible.map((row) => {
          const feature = formatVariableDisplayName(
            splitMandateKey(row.mandate_key).feature,
          );
          const bucket = scopeOf(row, userId);
          const active = row.mandate_key === selected?.mandate_key;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelectedKey(row.mandate_key)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "block w-full min-w-0 rounded px-2 py-1 text-left transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-accent",
              )}
            >
              <span className="block truncate text-xs font-medium">
                {mandateDisplayName(row.mandate_key, row.label)}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {feature}
                {scope === "all" && bucket === "orgs" && orgName(row.organization_id)
                  ? ` · ${orgName(row.organization_id)}`
                  : ""}
              </span>
            </button>
          );
        })}
        {rows && visible.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-muted-foreground">
            No mandate matches.
          </p>
        ) : null}
        {!rows && !loadError ? (
          <div className="flex items-center gap-1.5 px-2 py-3 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Reading mandates
          </div>
        ) : null}
      </div>
    </div>
  );

  const titleNode = (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate text-xs font-medium text-foreground">
        {selectedName}
      </span>
      {fullPageHref ? (
        <a
          href={fullPageHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the full page in a new tab"
          title="Open the full page in a new tab"
          onPointerDown={(event) => event.stopPropagation()}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <SquareArrowOutUpRight className="h-3 w-3" />
        </a>
      ) : null}
    </span>
  );

  return (
    <WindowPanel
      id="mandate-window-next"
      title={selectedName}
      titleNode={titleNode}
      onClose={onClose}
      width={900}
      height={640}
      minWidth={560}
      minHeight={380}
      overlayId="mandateWindowNext"
      onCollectData={() => ({
        initialMandateKey: selected?.mandate_key ?? null,
        initialTab: tab,
      })}
      sidebar={sidebar}
      sidebarDefaultSize={230}
      sidebarMinSize={180}
      urlSyncKey="mandate_next"
      urlSyncId={selected?.mandate_key ?? "mandate-window-next"}
      urlSyncArgs={{ t: tab }}
      footer={<div ref={setFooterEl} className="flex w-full items-center justify-end" />}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
        <div className="shrink-0 border-b border-border px-2 py-1">
          <RecordTabStrip
            tabs={visibleRecordTabs(isSuperAdmin)}
            value={tab}
            onChange={setTab}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {loadError ? (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {loadError}
            </p>
          ) : !rows ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading mandates
            </div>
          ) : !selected ? (
            <p className="text-xs text-muted-foreground">
              No mandate is visible to you yet.
            </p>
          ) : (
            <MandateRecordBody
              key={selected.id}
              mandateKeyOrId={selected.mandate_key}
              host="window"
              activeTab={tab}
              onTabChange={setTab}
              listHref="/mandates"
              renderChrome={({ exportMenu }) =>
                footerEl ? createPortal(exportMenu, footerEl) : null
              }
            />
          )}
        </div>
      </div>
    </WindowPanel>
  );
}
