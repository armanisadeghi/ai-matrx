"use client";

/**
 * MandateWindowNext — the NEW mandate window, registered beside the old
 * `MandateWindow` (untouched) so the owner can compare them
 * (common-docs/systems/intelligence/mandates/UI-REGISTER.md item 6b, line by line).
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
import { Button } from "@/components/ui/button";
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
import { mandateDisplayName } from "@/features/mandates/mandate-words";
import { useMandateDisplayName } from "@/features/mandates/useMandateDisplayName";
import { mandateRoute } from "@/features/mandates/browse/types";
import { featureLabelOf } from "@/features/mandates/admin-list/rows";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { cn } from "@/lib/utils";
import { adminDoorOpen } from "@/lib/api/adminDoor";
import { supabase } from "@/utils/supabase/client";
import { readAllRows } from "@ai-matrx/data/db";
import { mandateBindings, mandateDefinitions } from "@/lib/supabase/mandateStorage";
import { MandateRecordBody } from "@/features/mandates/record-next/MandateRecordBody";
import { RecordTabStrip } from "@/features/mandates/record-next/RecordTabStrip";
import {
  mandateRecordPreviewHref,
  parseRecordTab,
  visibleRecordTabs,
  type RecordTabId,
} from "@/features/mandates/record-next/record-tabs";
import { windowSelectionOf } from "./window-selection";
import { MandateStatusBadge } from "@/features/mandates/status/MandateStatusBadge";
import { MandateStatusControl } from "@/features/mandates/status/MandateStatusControl";
import { mandateStatusOfRow } from "@/features/mandates/status/mandate-status";
import { seatCanManageMandate } from "@/features/mandates/status/can-manage";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface MandateWindowNextProps {
  isOpen?: boolean;
  onClose?: () => void;
  initialMandateKey?: string | null;
  initialTab?: string | null;
}

type Scope = "all" | "mine" | "orgs" | "system" | "users";

/** A person's seat (user pages): what I made, what my teams have. */
const PERSON_SCOPES: { id: Scope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" }, // personal-seat-ok: user pages only; the admin seat gets ADMIN_SCOPES
  { id: "orgs", label: "My Orgs" }, // personal-seat-ok: user pages only; the admin seat gets ADMIN_SCOPES
  { id: "system", label: "System" },
];

/**
 * THE ADMIN SEAT (Arman, 2026-09-26: "No one acts as themselves in admin"):
 * inside the admin section the window answers platform questions — never
 * Mine / My Orgs. Each row names its owning organization or person.
 */
const ADMIN_SCOPES: { id: Scope; label: string }[] = [
  { id: "system", label: "System" },
  { id: "orgs", label: "Organizations" },
  { id: "users", label: "Users" },
  { id: "all", label: "All" },
];

/**
 * The admin seat's corpus: every live mandate on the platform and its live
 * bindings, read under the admin lane (RLS `platform_admin_read` is the whole
 * platform). Complete by construction — `readAllRows`, never a capped select.
 */
async function fetchPlatformMandates(): Promise<{
  mandates: MandateDefinitionRow[];
  bindingsByMandateId: Record<string, { deleted_at?: string | null }[]>;
}> {
  const [mandates, bindings] = await Promise.all([
    readAllRows(
      ({ from, to }) =>
        mandateDefinitions(supabase)
          .select("*", { count: "exact" })
          .is("deleted_at", null)
          .order("mandate_key")
          .range(from, to),
      { label: "mandate.definition (admin window)" },
    ),
    readAllRows(
      ({ from, to }) =>
        mandateBindings(supabase)
          .select("id, mandate_id, deleted_at", { count: "exact" })
          .is("deleted_at", null)
          .order("id")
          .range(from, to),
      { label: "mandate.binding (admin window)" },
    ),
  ]);
  const bindingsByMandateId: Record<string, { deleted_at?: string | null }[]> = {};
  for (const binding of bindings) {
    (bindingsByMandateId[binding.mandate_id] ??= []).push(binding);
  }
  return { mandates: mandates as MandateDefinitionRow[], bindingsByMandateId };
}

interface OwnerOrg {
  name: string;
  isPersonal: boolean;
}

/** Exclusive buckets. Person seat: System / Mine (I created it) / orgs.
 *  Admin seat: System / Organizations / Users (a personal organization). */
function scopeOf(
  row: MandateDefinitionRow,
  userId: string | null,
  adminSeat: boolean,
  owners: Record<string, OwnerOrg>,
): Exclude<Scope, "all"> {
  if ((row.organization_id ?? "").toLowerCase() === SYSTEM_ORGANIZATION_ID.toLowerCase()) {
    return "system";
  }
  if (adminSeat) {
    return row.organization_id && owners[row.organization_id]?.isPersonal ? "users" : "orgs";
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
  const [bindingsById, setBindingsById] = useState<
    Record<string, { deleted_at?: string | null }[]>
  >({});
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialMandateKey ?? null,
  );
  const [tab, setTab] = useState<RecordTabId>(() =>
    parseRecordTab(initialTab, true),
  );
  // The PAGE decides the seat (adminDoorOpen — the same rule every shared
  // component uses to pick its admin door).
  const [adminSeat] = useState(() => adminDoorOpen());
  const SCOPES = adminSeat ? ADMIN_SCOPES : PERSON_SCOPES;
  const [scope, setScope] = useState<Scope>(() => (adminSeat ? "system" : "all"));
  // Admin seat: who owns each row (organization name + whether it is a
  // person's personal organization), read for the rows' own organizations.
  const [owners, setOwners] = useState<Record<string, OwnerOrg>>({});
  const [search, setSearch] = useState("");
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);
  const [activeRowEl, setActiveRowEl] = useState<HTMLButtonElement | null>(null);

  // The selected mandate is always in view in the sidebar (opened on one far
  // down the list, or restored after a reload).
  useEffect(() => {
    activeRowEl?.scrollIntoView({ block: "center" });
  }, [activeRowEl]);

  useEffect(() => {
    let cancelled = false;
    // Every mandate the viewer can see: the platform's plus every org they
    // are in (the one list door, `ALL_HOMES`). Any mandate write anywhere
    // re-reads it (the same bus the console and the old window use).
    const read = () => {
      // THE ADMIN SEAT reads the WHOLE platform — never "the system plus the
      // organizations I belong to" (`ALL_HOMES`), which is the viewer's own seat.
      (adminSeat ? fetchPlatformMandates() : fetchMandateConsoleData())
        .then((next) => {
          if (cancelled) return;
          setRows(next.mandates);
          setBindingsById(next.bindingsByMandateId);
          setLoadFailed(false);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          // The technical reason goes to the console; the person gets one
          // short sentence and a Retry (a raw transport error is not words).
          console.error("[mandate-window-next] load failed", err);
          setLoadFailed(true);
        });
    };
    read();
    const off = onMandateCacheInvalidated(read);
    return () => {
      cancelled = true;
      off();
    };
  }, [reloads, adminSeat]);

  useEffect(() => {
    if (!adminSeat || !rows) return;
    const ids = [
      ...new Set(
        rows
          .map((row) => row.organization_id)
          .filter((id): id is string => Boolean(id) && id !== SYSTEM_ORGANIZATION_ID),
      ),
    ];
    if (ids.length === 0) return;
    let cancelled = false;
    void supabase
      .schema("iam")
      .from("organizations")
      .select("id, name, is_personal")
      .in("id", ids)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[mandate-window-next] owner names could not be read", error);
          return;
        }
        const next: Record<string, OwnerOrg> = {};
        for (const org of data ?? []) {
          next[org.id] = { name: org.name, isPersonal: org.is_personal === true };
        }
        setOwners(next);
      });
    return () => {
      cancelled = true;
    };
  }, [adminSeat, rows]);

  const statusOf = (row: MandateDefinitionRow) =>
    mandateStatusOfRow(row, bindingsById[row.id] ?? []);

  const orgNames = new Map(organizations.map((o) => [o.id, o.name]));
  const orgName = (id: string | null) =>
    id ? (owners[id]?.name ?? orgNames.get(id) ?? null) : null;

  const counts: Record<Scope, number> = { all: 0, mine: 0, orgs: 0, system: 0, users: 0 };
  for (const row of rows ?? []) {
    counts.all += 1;
    counts[scopeOf(row, userId, adminSeat, owners)] += 1;
  }

  const query = search.trim().toLowerCase();
  const visible = (rows ?? [])
      .filter((row) => scope === "all" || scopeOf(row, userId, adminSeat, owners) === scope)
      .filter((row) => {
        if (!query) return true;
        return [
          mandateDisplayName(row.mandate_key, row.label),
          featureLabelOf(row.mandate_key, null),
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

  // The open mandate is ONLY the one chosen (or opened on). Scope, search and
  // reloads of the list never move it — see ./window-selection.ts.
  const selection = windowSelectionOf(rows, selectedKey);
  const selected = selection.status === "found" ? selection.row : null;
  const openKey =
    selection.status === "found"
      ? selection.row.mandate_key
      : selection.status === "pending"
        ? selection.key
        : null;
  const derivedName = useMandateDisplayName(openKey ?? "", selected?.label);
  const selectedName =
    selection.status === "not-found"
      ? "Mandate not found"
      : openKey
        ? derivedName
        : "Mandates";
  const fullPageHref = openKey
    ? isSuperAdmin
      ? mandateRecordPreviewHref(openKey, tab)
      : mandateRoute({ mandate_key: openKey })
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
      <div className="flex-1 min-h-0 space-y-px overflow-y-auto p-1">
        {visible.map((row) => {
          const feature = featureLabelOf(row.mandate_key, null);
          const bucket = scopeOf(row, userId, adminSeat, owners);
          const active = row.id === selected?.id;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelectedKey(row.mandate_key)}
              aria-current={active ? "true" : undefined}
              ref={active ? setActiveRowEl : undefined}
              className={cn(
                "block w-full min-w-0 rounded px-2 py-1 text-left transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-accent",
              )}
            >
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate text-xs font-medium">
                  {mandateDisplayName(row.mandate_key, row.label)}
                </span>
                {/* A draft or disabled job says so in the list itself; an
                    active one stays quiet so the exceptions stand out. */}
                {statusOf(row) !== "active" ? (
                  <MandateStatusBadge status={statusOf(row)} size="sm" className="ml-auto" />
                ) : null}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {feature}
                {(adminSeat ? bucket !== "system" : scope === "all" && bucket === "orgs") &&
                orgName(row.organization_id)
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
        {loadFailed && !rows ? (
          <div className="flex flex-col items-start gap-1.5 px-2 py-3 text-[11px] text-muted-foreground">
            The list could not be read.
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              onClick={() => setReloads((n) => n + 1)}
            >
              Retry
            </Button>
            <ErrorAlchemyMenu />
          </div>
        ) : null}
        {!rows && !loadFailed ? (
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
      {selected ? (
        <span onPointerDown={(event) => event.stopPropagation()} className="inline-flex">
          <MandateStatusControl
            mandateId={selected.id}
            name={selectedName}
            status={statusOf(selected)}
            canManage={seatCanManageMandate(selected, {
              level: isSuperAdmin ? "system" : "person",
              userId,
              orgId: null,
              canManageOrg: false,
            })}
            onSetHolder={() => setTab("holder")}
            size="sm"
          />
        </span>
      ) : null}
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
        initialMandateKey: openKey,
        initialTab: tab,
      })}
      sidebar={sidebar}
      sidebarDefaultSize={230}
      sidebarMinSize={180}
      urlSyncKey="mandate_next"
      // The real key from the first frame — never a placeholder while the list
      // loads (a reload in that window would reopen on nothing).
      urlSyncId={openKey ?? "mandate-window-next"}
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
          {selection.status === "not-found" ? (
            <p className="text-xs text-muted-foreground">Mandate not found</p>
          ) : !openKey ? (
            <p className="text-xs text-muted-foreground">
              {rows && rows.length === 0
                ? "No mandate is visible to you yet."
                : "Pick a mandate from the list."}
            </p>
          ) : (
            // The record reads itself by key, so it never waits on (or dies
            // with) the list beside it.
            <MandateRecordBody
              key={openKey}
              mandateKeyOrId={openKey}
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
