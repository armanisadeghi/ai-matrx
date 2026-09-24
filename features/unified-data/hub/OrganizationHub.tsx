"use client";

// features/unified-data/hub/OrganizationHub.tsx — LANE DATA-HUB
//
// THE ORGANIZATION'S FRONT DOOR FOR THE RECORD STORE, and it is /data-v2's own
// landing rather than a second route family. Before this, /data-v2 listed an
// organization's TABLES and nothing else: forms, bookings, portals, dashboards,
// digests, checklists, automations, sharing and the archive existed only as
// rails inside ONE table's page, so "what forms do we have?" meant opening
// forty tables one at a time.
//
// Everything here is composition over `@ai-matrx/records-ui`'s published
// primitives — the lane words (`visibilityLaneFor`, `VISIBILITY_LANE_TITLE`), the archive control
// (`ArchivedDisclosure`), the archived portals rail, the tables home, the
// inbox. Nothing was forked and no package was republished for it. The ONE
// thing that had to be new is SQL, because the store had no cross-table door
// for automations, for sharing outside, or for "who changed this" — and a hub
// assembled by asking per table in the browser is the thing we refuse.
//
// THE LANES ARE THE PACKAGE'S, not this file's. `visibilityLaneFor(table)` is the only
// place a lane is decided anywhere in the platform, and a thing's lane here is
// the lane of the TABLE it belongs to — which is what makes "my organization"
// mean the same word on this page and on the tables list underneath it.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArchivedDisclosure,
  ArchivedPortals,
  VISIBILITY_LANES,
  VISIBILITY_LANE_TITLE,
  TablesHome,
  type VisibilityLane,
} from "@ai-matrx/records-ui";
import { useRecordsClient, useTables } from "@ai-matrx/records/react";
import type { RecordsDataSource, Table } from "@ai-matrx/records";
import { Button, cn } from "@ai-matrx/design-system";

import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationName } from "@/lib/redux/slices/appContextSlice";

/** The organization's member-visibility setting, at its one registry address. */
const MEMBER_VISIBILITY = { feature: "custom", key: "member_default_visibility" } as const;

import {
  HUB_CAPABILITIES,
  attachChangedBy,
  type HubItem,
  type HubReadContext,
} from "./capabilities";
import { HubListing, type HubListingState } from "./HubListing";
import { AllOrganizationsTables, OrganizationScopeStrip } from "./OrganizationScope";
import * as doors from "./doors";

/** An archived Table, with the one thing a person wants to do to it. */
interface ArchivedTable {
  id: string;
  name: string;
  archivedAt: string;
  archivedByName: string | null;
}

export interface OrganizationHubProps {
  organizationId: string;
  /**
   * THE SAME data seam the mount above is bound to, handed down rather than
   * built a second time — one client, one session, one set of headers. It is
   * here at all because three of the doors this hub reads are newer than the
   * installed `@ai-matrx/records` client (see `doors.ts`).
   */
  dataSource: RecordsDataSource;
  /**
   * WHAT IS WAITING ON THIS PERSON, RENDERED UNDER THE LISTINGS AND NOT OVER THEM.
   *
   * 🚨 IT USED TO BE THE FIRST THING ON THE ORGANIZATION'S FRONT DOOR
   * (VERIFIER-14 §3, measured on Rincon Plumbing Co): an `Inbox 37` stack of
   * approval cards filled the whole first screen at 1600 px and two screens at
   * 390 px, so a person opening /data-v2 met somebody's field-proposal queue
   * before they met the front door. The queue is not less important for being
   * lower — it is one section among the organization's own, and it is still one
   * scroll away with its own count on it.
   *
   * It is a slot rather than an import because the inbox is the package's
   * `ActionInbox` and its Open must route through the host's router; the page
   * above owns both.
   */
  inbox?: ReactNode | undefined;
}

export function OrganizationHub({ organizationId, dataSource, inbox }: OrganizationHubProps) {
  const router = useRouter();
  /**
   * THE FILTER IS NAMED, AND "ALL" IS ONE CLICK (lane ACCESS-IS-PERSONAL, owner's law
   * 2026-09-23): this LIST is the active organization's, so the page says which one and offers
   * the way out. `?scope=all` is the unfiltered list, on the address so it can be sent.
   */
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const organizationName = useAppSelector(selectOrganizationName);
  const showingAll = searchParams.get("scope") === "all";
  const setScope = useCallback(
    (all: boolean) => {
      const next = new URLSearchParams(searchParams.toString());
      if (all) next.set("scope", "all");
      else next.delete("scope");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  const client = useRecordsClient();
  const tablesRead = useTables();
  const userIdForFacts = useAppSelector(selectUserId);
  /**
   * WHO CAN SEE EACH TABLE, AND WHICH ARE MINE. The Table list carries each
   * Table's document, and `visibility` and `created_by` are record COLUMNS, not
   * document keys — so without this read every Table arrived with neither, every
   * lane fell through to its default and Mine read 0 everywhere (VERIFIER-16 M6).
   * `null` while reading; `{ failed }` when the door did not answer — and then the
   * lane filters are ABSENT, with the reason, never lanes that quietly lie.
   */
  const [facts, setFacts] = useState<
    | { phase: "reading" }
    | { phase: "read"; rows: Map<string, { visibility: string; mine: boolean }> }
    | { phase: "failed"; why: string }
  >({ phase: "reading" });
  useEffect(() => {
    let alive = true;
    setFacts({ phase: "reading" });
    void doors.tableFacts(dataSource, organizationId).then((answered) => {
      if (!alive) return;
      setFacts(
        answered.ok
          ? {
              phase: "read",
              rows: new Map(answered.data.map((r) => [r.table_id, { visibility: r.visibility, mine: r.mine }])),
            }
          : { phase: "failed", why: answered.error.message },
      );
    });
    return () => {
      alive = false;
    };
  }, [dataSource, organizationId]);
  const tables = useMemo<readonly Table[]>(() => {
    const listed = tablesRead.data ?? [];
    if (facts.phase !== "read") return listed;
    // The two columns folded onto the Table the package's own lane decision
    // reads (`visibilityLaneFor`), so the lane is decided in ONE place.
    return listed.map((t) => {
      const f = facts.rows.get(t.id);
      return f
        ? ({ ...t, visibility: f.visibility, created_by: f.mine ? (userIdForFacts ?? t.created_by) : t.created_by } as Table)
        : t;
    });
  }, [tablesRead.data, facts, userIdForFacts]);
  const lanesKnown = facts.phase === "read";

  const [lane, setLane] = useState<VisibilityLane | null>(null);
  /**
   * "SHOW EVERYTHING" (SCOPES-CONTEXT-TRANSITION SC-1', finished by SC-1-TAILS). What the app keeps
   * for itself — a column's choices, the context system's scope tables, its own bookkeeping — is
   * marked and never hidden from its owner, but it is not the organization's own data, so its
   * section waits behind one control that says how many there are. The owner (2026-09-23):
   * "the user will not see it as data in a normal view … There should be options for someone to
   * see all, but not at random."
   */
  const [showEverything, setShowEverything] = useState(false);
  /**
   * DOES THIS ORGANIZATION SHOW A MEMBER ONLY WHAT IS SHARED WITH THEM? The
   * organization's own setting, read through the one knob reader. An
   * unresolved value reads as "no", which keeps the ordinary sentence — it
   * never invents a sharing rule nobody measured.
   */
  const userId = useAppSelector(selectUserId);
  const memberVisibility = useEffectiveKnob(organizationId, userId, MEMBER_VISIBILITY);
  const sharedOnly = memberVisibility === "shared_only";
  const [states, setStates] = useState<Record<string, HubListingState>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({ tables: true });
  const [archivedTables, setArchivedTables] = useState<ArchivedTable[] | null>(null);
  const [archiveTrouble, setArchiveTrouble] = useState<string | null>(null);
  /** Said when the archive is bigger than the hub reads in one visit. Never a failure. */
  const [archiveNote, setArchiveNote] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  // EVERY CAPABILITY, ONE CALL EACH, IN PARALLEL. Ten doors, ten round trips
  // for the whole organization — not ten per table.
  useEffect(() => {
    if (tablesRead.loading) return;
    // Read the capabilities ONCE, after the lane facts have answered either way,
    // rather than once before and once after.
    if (facts.phase === "reading") return;
    let alive = true;
    const ctx: HubReadContext = {
      client,
      dataSource,
      organizationId,
      tables,
      tableKernelId: null,
    };
    setStates(
      Object.fromEntries(HUB_CAPABILITIES.map((c) => [c.id, { phase: "reading" } as HubListingState])),
    );
    void (async () => {
      // THE SWITCH, READ HERE TOO AND NOT ONLY BY THE PAGE ABOVE. The mount is
      // already behind it, so this is belt and braces on purpose: a hub that
      // read ten doors because a host forgot its gate would be the campaign's
      // code running for an organization that never turned the store on. `off`
      // and `could not check` are different sentences and both are said.
      const gate = await UNIFIED_DATA_CAMPAIGN.check(organizationId);
      if (!alive) return;
      if (gate.state !== "on") {
        const message =
          gate.state === "unavailable"
            ? `The store's switch could not be read, so nothing was read — this is not an answer about the organization. ${gate.cause}`
            : "This organization does not keep its data in the record store, so nothing was read.";
        setStates(
          Object.fromEntries(
            HUB_CAPABILITIES.map((c) => [
              c.id,
              { phase: "refused", error: { message } } as HubListingState,
            ]),
          ),
        );
        return;
      }
      for (const capability of HUB_CAPABILITIES) {
        void (async () => {
          const answered = await capability.read(ctx);
          if (!alive) return;
          if (!answered.ok) {
            setStates((prev) => ({
              ...prev,
              [capability.id]: { phase: "refused", error: answered.error },
            }));
            return;
          }
          await attachChangedBy(ctx, capability, answered.items);
          if (!alive) return;
          setStates((prev) => ({
            ...prev,
            [capability.id]: { phase: "read", items: answered.items },
          }));
        })();
      }
    })();
    return () => {
      alive = false;
    };
  }, [client, dataSource, organizationId, tables, tablesRead.loading, facts.phase]);

  // THE ARCHIVE, through the store's own archived door over the Table kernel —
  // the same door a table's own archive uses, addressed at the kernel that
  // holds every Table, so it is one call and not one per table.
  const readArchive = useCallback(async () => {
    const kernel = await doors.tableKernelId(dataSource);
    if (!kernel.ok) {
      setArchiveTrouble(kernel.error.message);
      return;
    }
    // 🚨 THE COUNT ON THE DISCLOSURE IS A COUNT, NEVER A PAGE SIZE (guide re-walk,
    // 2026-09-23): "Show archived tables (100)" was the first page's LIMIT printed
    // as if it were how many there are. The door answers pages and says the
    // total only once a page comes back short, so the hub reads until it does.
    const PAGE = 100;
    const MAX_PAGES = 50;
    const rows: Array<{
      id: string;
      document: unknown;
      archivedAt: string;
      archivedByName: string | null;
    }> = [];
    let complete = false;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const answered = await client.listArchived({
        table_id: kernel.data,
        lane: "org",
        limit: PAGE,
        offset: page * PAGE,
      });
      if (!answered.ok) {
        setArchiveTrouble(answered.error.message);
        return;
      }
      rows.push(...answered.data.rows);
      if (answered.data.total !== null) {
        complete = true;
        break;
      }
    }
    setArchiveTrouble(null);
    setArchiveNote(
      complete
        ? null
        : `More than ${PAGE * MAX_PAGES} tables are archived here; the first ${PAGE * MAX_PAGES} are listed.`,
    );
    setArchivedTables(
      rows.map((row) => ({
        id: row.id,
        name:
          (row.document as { name?: string } | null)?.name?.trim() || "(unnamed table)",
        archivedAt: row.archivedAt,
        archivedByName: row.archivedByName,
      })),
    );
  }, [client, dataSource]);

  useEffect(() => {
    void readArchive();
  }, [readArchive]);

  const bringBack = useCallback(
    async (tableId: string) => {
      setRestoring(tableId);
      const answered = await client.recordRestore({ record_id: tableId });
      setRestoring(null);
      if (!answered.ok) {
        setArchiveTrouble(answered.error.message);
        return;
      }
      await readArchive();
      router.refresh();
    },
    [client, readArchive, router],
  );

  /** The lane filter, applied to every listing at once. */
  /**
   * WHICH TABLES ARE MINE — the ones I MADE, whatever their visibility (chair
   * ruling, 2026-09-23). Mine is the only lane that is not a visibility: a new
   * table is internal, so it sits under Mine AND under My organization, and a
   * table somebody else made that is shared across the organization is under My
   * organization only. The creator is the Table record's own `created_by`.
   */
  const ownedTableIds = useMemo(
    () => new Set(tables.filter((t) => userId && t.created_by === userId).map((t) => t.id)),
    [tables, userId],
  );
  const inLane = useCallback(
    (item: HubItem, wanted: VisibilityLane): boolean => {
      // No lane at all — the app's own tables, another organization's — is
      // under Everything only.
      if (item.lane === null) return false;
      if (wanted === "mine") return Boolean(item.tableId && ownedTableIds.has(item.tableId));
      return item.lane === wanted;
    },
    [ownedTableIds],
  );
  const filtered = useMemo(() => {
    const out: Record<string, HubListingState> = {};
    for (const [id, state] of Object.entries(states)) {
      out[id] =
        state.phase === "read" && lane
          ? { phase: "read", items: state.items.filter((item) => inLane(item, lane)) }
          : state;
    }
    return out;
  }, [states, lane, inLane]);

  /**
   * THE LIST'S ONE PLACE TO NARROW IT (lane DATA-V2-FACE, owner 2026-09-24): which organization,
   * and whose — on ONE row above the tables, and nothing else above them. The lanes, as filters
   * and never a flat list; the words are the package's.
   */
  const laneFilter = (
    lanesKnown ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Show</span>
          <button
            type="button"
            data-hub-lane="everything"
            onClick={() => setLane(null)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs transition-colors",
              lane === null
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-muted/50",
            )}
          >
            Everything
          </button>
          {/* THE FOUR VISIBILITY LANES — mine, my organization, community, world —
              and nothing else (VERIFIER-15: six chips, two of which were about who
              MADE a table, not who can see it). */}
          {VISIBILITY_LANES.map((candidate) => (
            <button
              key={candidate}
              type="button"
              data-hub-lane={candidate}
              onClick={() => setLane(candidate)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs transition-colors",
                lane === candidate
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              {VISIBILITY_LANE_TITLE[candidate]}
            </button>
          ))}
        </div>
      ) : facts.phase === "failed" ? (
        /* ABSENT, NEVER A LIE. Without the facts every table would be filed under
           My organization and Mine would read 0 — so the filters are not offered,
           and the reason is. */
        <p className="text-xs text-muted-foreground">
          Who can see each table, and which are yours, could not be read, so only everything is
          shown. {facts.why}
        </p>
      ) : null
  );
  const scopeStrip = (
    <OrganizationScopeStrip
      organizationName={organizationName}
      showingAll={showingAll}
      onShowAll={() => setScope(true)}
      onShowOne={() => setScope(false)}
      trailing={showingAll ? null : laneFilter}
    />
  );
  if (showingAll) {
    return (
      <div data-hub-root className="space-y-4">
        {scopeStrip}
        <AllOrganizationsTables dataSource={dataSource} />
      </div>
    );
  }

  return (
    <div data-hub-root className="space-y-4">
      {scopeStrip}

      {HUB_CAPABILITIES.filter((capability) => capability.id !== "kept-by-the-app" || showEverything).map((capability) => (
        <HubListing
          key={capability.id}
          capability={capability}
          state={filtered[capability.id] ?? { phase: "reading" }}
          laneLabel={lane ? VISIBILITY_LANE_TITLE[lane] : null}
          lane={lane}
          sharedOnly={sharedOnly}
          open={open[capability.id] ?? false}
          onOpenChange={(next) => setOpen((prev) => ({ ...prev, [capability.id]: next }))}
        />
      ))}

      {(() => {
        const kept = states["kept-by-the-app"];
        const keptCount = kept?.phase === "read" ? kept.items.length : 0;
        if (keptCount === 0) return null;
        return (
          <div
            data-hub-show-everything={showEverything ? "on" : "off"}
            className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
          >
            <span>
              {showEverything
                ? `Showing everything, including the ${keptCount} ${keptCount === 1 ? "table" : "tables"} the app keeps for itself.`
                : `${keptCount} ${keptCount === 1 ? "table" : "tables"} the app keeps for itself ${keptCount === 1 ? "is" : "are"} not listed here.`}
            </span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setShowEverything((on) => !on)}>
              {showEverything ? "Hide what the app keeps" : "Show everything"}
            </Button>
          </div>
        );
      })()}

      {/* THE QUEUE, UNDER THE FRONT DOOR RATHER THAN OVER IT. See `inbox` above. */}
      {inbox}

      {/* ARCHIVED ITEMS — one click where you already are, closed by default,
          and the way back is on the row (the archived-items law, 2026-09-09). */}
      <section data-hub-archive className="rounded-lg border border-border bg-card p-3">
        <ArchivedDisclosure noun="tables" count={archivedTables?.length}>
          {archiveNote ? <p className="py-2 text-xs text-muted-foreground">{archiveNote}</p> : null}
          {archiveTrouble ? (
            <p className="py-2 text-xs text-destructive">
              The archive did not answer, so nothing was read — this is not an empty archive.{" "}
              {archiveTrouble}
            </p>
          ) : archivedTables === null ? (
            <p className="py-2 text-xs text-muted-foreground">Asking the store&rsquo;s archive…</p>
          ) : archivedTables.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              Nothing has been archived here. Archiving a table takes it out of everyone&rsquo;s
              list and keeps its records, so it can always come back.
            </p>
          ) : (
            <ul>
              {archivedTables.map((table) => (
                <li
                  key={table.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border py-2 first:border-t-0"
                >
                  <span className="text-sm text-foreground">{table.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {table.archivedByName ? `${table.archivedByName}, ` : ""}
                    {new Date(table.archivedAt).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={restoring === table.id}
                    onClick={() => void bringBack(table.id)}
                  >
                    {restoring === table.id ? "Bringing it back…" : "Bring it back"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ArchivedDisclosure>
        <div className="mt-2">
          <ArchivedPortals />
        </div>
      </section>

      {/* THE TABLES THEMSELVES, with making and importing on them — the package's
          own home, unchanged, under the hub rather than instead of it. */}
      <TablesHome
        onOpenTable={(tableId: string, dashboardId?: string | null) =>
          router.push(
            dashboardId ? `/data-v2/${tableId}?dashboard=${dashboardId}` : `/data-v2/${tableId}`,
          )
        }
      />
    </div>
  );
}
