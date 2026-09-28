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
import { ArchivedDisclosure, ArchivedPortals, TablesHome } from "@ai-matrx/records-ui";
import { useRecordsClient, useTables } from "@ai-matrx/records/react";
import type { RecordsDataSource, Table } from "@ai-matrx/records";
import { Button, cn } from "@ai-matrx/design-system";

import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationName } from "@/lib/redux/slices/appContextSlice";
import { useUserRole } from "@/features/organizations/hooks";
import { OrganizationPickerPopover } from "@/features/organizations/components/OrganizationPickerPopover";

/** What each listing's rows are, in the store's kind words — every row on the home says its kind. */
const LISTING_KIND: Record<string, string> = {
  forms: "form",
  bookings: "booking",
  portals: "portal",
  dashboards: "dashboard",
  digests: "digest",
  checklists: "checklist",
  automations: "automation",
  "shared-outside": "share",
  "shared-with-me": "table",
};

/** The organization's member-visibility setting, at its one registry address. */
const MEMBER_VISIBILITY = { feature: "custom", key: "member_default_visibility" } as const;

import {
  HUB_CAPABILITIES,
  attachChangedBy,
  seesOnlyWhatIsShared,
  type HubItem,
  type HubReadContext,
  withHubTableFacts,
} from "./capabilities";
import { ArchivedTablesList, type ArchivedTable } from "./ArchivedTablesList";
import { HubListing, type HubListingState } from "./HubListing";
import * as doors from "./doors";
import type { DataHomeTableRow, DoorFailure, TableFactRow } from "./doors";
import {
  ALL_KINDS,
  DATA_HOME_DEFAULT_KIND_KNOB,
  DATA_HOME_DEFAULT_ORDER_KNOB,
  DATA_HOME_DEFAULT_SCOPE_KNOB,
  DATA_HOME_SCOPES,
  DATA_HOME_SCOPE_TITLE,
  dataHomeScopeHref,
  inDataHomeScope,
  dataHomeKindHref,
  kindTitle,
  kindsOnOffer,
  listingShownUnderKind,
  resolveDataHomeKind,
  resolveDataHomeOrder,
  resolveDataHomeScope,
  visibilityOfLane,
  type DataHomeScope,
} from "./dataHomeScope";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";


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
  /**
   * The NAME of the organization this list shows, when the ADDRESS names it (`?org=`, e.g. the
   * way back from a table that was just archived). Absent, the list is the active
   * organization's and its name is read from the selection.
   */
  organizationName?: string | null | undefined;
}

export function OrganizationHub({
  organizationId,
  dataSource,
  inbox,
  organizationName: namedOrganizationName,
}: OrganizationHubProps) {
  const router = useRouter();
  /**
   * THE FIVE FILTERS — All · Mine · My Orgs · Shared · Public (lane DATA-HOME-1, Arman
   * 2026-09-27). The home opens on the Feature Knob `custom.data_home_default_scope` (platform
   * default All: everything the person can see in every organization); `?scope=` is what the
   * person chose. Choosing is a NAVIGATION (router.push), so the browser's Back undoes it — the
   * old strip rewrote the address in place and "All my organizations" had no way back.
   */
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const selectedOrganizationName = useAppSelector(selectOrganizationName);
  const organizationName = namedOrganizationName ?? selectedOrganizationName;
  const knobUserId = useAppSelector(selectUserId);
  const defaultScope = useEffectiveKnob(organizationId, knobUserId, DATA_HOME_DEFAULT_SCOPE_KNOB);
  const scope: DataHomeScope = resolveDataHomeScope(searchParams.get("scope"), defaultScope);
  const defaultKind = useEffectiveKnob(organizationId, knobUserId, DATA_HOME_DEFAULT_KIND_KNOB);
  const kind = resolveDataHomeKind(searchParams.get("kind"), defaultKind);
  const order = resolveDataHomeOrder(useEffectiveKnob(organizationId, knobUserId, DATA_HOME_DEFAULT_ORDER_KNOB));
  const chooseKind = useCallback(
    (next: string) => {
      const href = dataHomeKindHref(pathname, searchParams, next);
      const here = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      if (href !== here) router.push(href, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  const chooseScope = useCallback(
    (next: DataHomeScope) => {
      const href = dataHomeScopeHref(pathname, searchParams, next);
      const here = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      if (href !== here) router.push(href, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  /**
   * EVERY TABLE SHE CAN OPEN, IN EVERY ORGANIZATION, with the facts the filters read — ONE call
   * (`custom.data_home_tables()`), never one per organization.
   */
  const [everywhere, setEverywhere] = useState<
    | { phase: "reading" }
    | { phase: "read"; rows: readonly DataHomeTableRow[] }
    | { phase: "failed"; error: DoorFailure }
  >({ phase: "reading" });
  useEffect(() => {
    let alive = true;
    void doors.dataHomeTables(dataSource).then((answered) => {
      if (!alive) return;
      setEverywhere(answered.ok ? { phase: "read", rows: answered.data } : { phase: "failed", error: answered.error });
    });
    return () => {
      alive = false;
    };
  }, [dataSource]);
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
    | { phase: "read"; rows: Map<string, TableFactRow> }
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
              rows: new Map(answered.data.map((r) => [r.table_id, r])),
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
    return withHubTableFacts(listed, facts.rows, userIdForFacts ?? null);
  }, [tablesRead.data, facts, userIdForFacts]);
  const [pickerOpen, setPickerOpen] = useState(false);

  /*
   * NO "SHOW EVERYTHING" FOLD ON THIS PAGE (Arman, 2026-09-27 21:40 PT): the home hides nothing.
   * What the app keeps for itself is listed with the rest, each row saying its kind, and the Kind
   * filter on the bar narrows it. (The fold still serves the organization's own Tables page.)
   */
  /**
   * DOES THIS ORGANIZATION SHOW A MEMBER ONLY WHAT IS SHARED WITH THEM? The
   * organization's own setting, read through the one knob reader. An
   * unresolved value reads as "no", which keeps the ordinary sentence — it
   * never invents a sharing rule nobody measured.
   */
  const userId = useAppSelector(selectUserId);
  const memberVisibility = useEffectiveKnob(organizationId, userId, MEMBER_VISIBILITY);
  // THE SENTENCE IS THE READER'S (UI-FIX-19): shared-only speaks to a member, never to the
  // owner or an admin, whose own lane still reaches every table.
  const { role: myRole } = useUserRole(organizationId);
  const sharedOnly = seesOnlyWhatIsShared(memberVisibility, myRole);
  const [states, setStates] = useState<Record<string, HubListingState>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({ tables: true });
  const [archivedTables, setArchivedTables] = useState<ArchivedTable[] | null>(null);
  const [archiveTrouble, setArchiveTrouble] = useState<string | null>(null);
  /** Said when the archive is bigger than the hub reads in one visit. Never a failure. */
  const [archiveNote, setArchiveNote] = useState<string | null>(null);

  // EVERY CAPABILITY, ONE CALL EACH, IN PARALLEL. Ten doors, ten round trips
  // for the whole organization — not ten per table.
  useEffect(() => {
    if (tablesRead.loading) return;
    // Read the capabilities ONCE, after the lane facts have answered either way,
    // rather than once before and once after.
    if (facts.phase === "reading") return;
    if (everywhere.phase === "reading") return;
    let alive = true;
    const ctx: HubReadContext = {
      client,
      dataSource,
      organizationId,
      tables,
      tableKernelId: null,
      everywhere:
        everywhere.phase === "read" ? { ok: true, rows: everywhere.rows } : { ok: false, error: everywhere.error },
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
  }, [client, dataSource, organizationId, tables, tablesRead.loading, facts.phase, everywhere]);

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

  // A REFUSED RESTORE IS THE ROW'S, NEVER THE ARCHIVE READ'S (UI-FIX-19): the refusal goes back
  // to the list, which draws it on the row and keeps every other row where it was.
  const bringBack = useCallback(
    async (tableId: string) => {
      const answered = await client.recordRestore({ record_id: tableId });
      if (!answered.ok) return answered.error;
      await readArchive();
      router.refresh();
      return null;
    },
    [client, readArchive, router],
  );

  /**
   * WHICH TABLES ARE MINE — the ones I MADE, whatever their visibility (chair ruling,
   * 2026-09-23), in THIS organization, for the things that belong to one of its tables (a form,
   * a booking page). The Tables listing carries its own facts from `custom.data_home_tables()`.
   */
  const ownedTableIds = useMemo(
    () => new Set(tables.filter((t) => userId && t.created_by === userId).map((t) => t.id)),
    [tables, userId],
  );
  const sharedWithMeIds = useMemo(
    () =>
      new Set(
        everywhere.phase === "read" ? everywhere.rows.filter((r) => r.shared_with_me).map((r) => r.table_id) : [],
      ),
    [everywhere],
  );
  const tableIdsListed = useMemo(
    () => new Set(everywhere.phase === "read" ? everywhere.rows.map((r) => r.table_id) : []),
    [everywhere],
  );
  /**
   * EVERY ROW NAMES ITS ORGANIZATION AND CARRIES THE FOUR FACTS. The Tables rows come with them
   * from the door; everything else here is this organization's (a member's), and a row shared
   * in from another organization is Shared and nothing else.
   */
  const labelled = useMemo(() => {
    const out: Record<string, HubListingState> = {};
    for (const [id, state] of Object.entries(states)) {
      if (state.phase !== "read") {
        out[id] = state;
        continue;
      }
      const items = state.items
        // An accepted share is already a row under Tables (its organization named); listing it
        // twice is the page saying one thing two times. An offer not yet accepted stays here.
        .filter((item) => !(id === "shared-with-me" && item.tableId && tableIdsListed.has(item.tableId) && item.id.startsWith("accepted:")))
        .map((item) => {
          if (item.scope) return item;
          if (id === "shared-with-me") {
            return {
              ...item,
              kind: "table",
              organizationName: item.tableName,
              scope: { mine: false, member: false, sharedWithMe: true, visibility: null },
            };
          }
          return {
            ...item,
            kind: item.kind ?? LISTING_KIND[id] ?? id,
            organizationName: organizationName ?? null,
            scope: {
              mine: Boolean(item.tableId && ownedTableIds.has(item.tableId)),
              member: true,
              sharedWithMe: Boolean(item.tableId && sharedWithMeIds.has(item.tableId)),
              visibility: visibilityOfLane(item.lane),
            },
          };
        });
      out[id] = { phase: "read", items };
    }
    return out;
  }, [states, tableIdsListed, organizationName, ownedTableIds, sharedWithMeIds]);
  const filtered = useMemo(() => {
    if (scope === "all" && kind === ALL_KINDS) return labelled;
    const out: Record<string, HubListingState> = {};
    for (const [id, state] of Object.entries(labelled)) {
      out[id] =
        state.phase === "read"
          ? {
              phase: "read",
              items: state.items.filter(
                (item) =>
                  (scope === "all" || (item.scope && inDataHomeScope(item.scope, scope))) &&
                  (kind === ALL_KINDS || id !== "tables" || item.kind === kind),
              ),
            }
          : state;
    }
    return out;
  }, [labelled, scope, kind]);
  /** Every kind the store's rows carry, for the Kind filter — never a kind with nothing behind it. */
  const kinds = useMemo(
    () => kindsOnOffer(everywhere.phase === "read" ? everywhere.rows.map((r) => r.kind) : [], kind),
    [everywhere, kind],
  );

  /**
   * THE LIST'S ONE PLACE TO NARROW IT: exactly All · Mine · My Orgs · Shared · Public, on ONE
   * row above everything (lane DATA-HOME-1). The forms, bookings and the rest below the tables
   * are the organization the person is working in — named on the same row, with Change, which is
   * the owner's law for a list an organization filters (2026-09-23).
   */
  const scopeRow = (
    <div
      data-hub-scope={scope}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs"
    >
      <div role="tablist" aria-label="Show" className="flex flex-wrap items-center gap-1.5">
        {DATA_HOME_SCOPES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={scope === candidate}
            data-hub-scope-choice={candidate}
            onClick={() => chooseScope(candidate)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs transition-colors",
              scope === candidate
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-muted/50",
            )}
          >
            {DATA_HOME_SCOPE_TITLE[candidate]}
          </button>
        ))}
      </div>
      {/* KIND — the store's own words, only kinds something here carries (more than four, so a
          select, never a row of pills). Arman 21:40 PT: one bar, no new rows. */}
      <label className="inline-flex items-center gap-1 text-muted-foreground">
        <span className="sr-only">Kind</span>
        <select
          data-hub-kind
          aria-label="Kind"
          value={kind}
          onChange={(event) => chooseKind(event.target.value)}
          className="h-6 rounded-full border border-border bg-background px-2 text-xs text-foreground"
        >
          {kinds.map((candidate) => (
            <option key={candidate} value={candidate}>
              {kindTitle(candidate)}
            </option>
          ))}
        </select>
      </label>
      <span className="ml-auto inline-flex items-center gap-x-1 whitespace-nowrap text-muted-foreground">
        Forms and pages from <span className="font-medium text-foreground">{organizationName ?? "the organization you are working in"}</span>
        <OrganizationPickerPopover
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          trigger={
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
              Change
            </Button>
          }
        />
      </span>
      {facts.phase === "failed" ? (
        /* NEVER A LIE: without the organization's facts, which of its forms and pages are yours
           cannot be said, so Mine shows only tables — and says why. */
        <p className="w-full text-xs text-muted-foreground">
          Which forms and pages here are yours could not be read, so Mine lists only tables. {facts.why}
          <ErrorAlchemyMenu error={facts.why} />
        </p>
      ) : null}
    </div>
  );

  return (
    <div data-hub-root className="space-y-4">
      {scopeRow}

      {/* MAKING A TABLE, AND ONLY THAT (lane POST-PUBLISH-FE, VERIFIER-18 M3). FIRST, UNDER THE
          STRIP (lane HANDOVER, 2026-09-27): it was the last thing on the page, below ten listings,
          the inbox and the archive, so at 1600x900 an owner with no tables read "Make one below"
          and saw no way to make one. The hub above
          already lists this organization's tables, dashboards and booking pages, with what the app
          keeps for itself behind Show everything; the package's home draws its own full lists
          unless told otherwise, so it is told `makingOnly` and one page never lists the same tables
          twice. */}
      <TablesHome
        makingOnly
        onOpenTable={(tableId: string, dashboardId?: string | null) =>
          router.push(
            dashboardId ? `/data-v2/${tableId}?dashboard=${dashboardId}` : `/data-v2/${tableId}`,
          )
        }
      />

      {HUB_CAPABILITIES.filter((capability) => listingShownUnderKind(capability.id, kind)).map((capability) => (
        <HubListing
          key={capability.id}
          capability={capability}
          state={filtered[capability.id] ?? { phase: "reading" }}
          scope={scope}
          kind={capability.id === "tables" ? kind : ALL_KINDS}
          order={order}
          groupByOrganization={scope === "all"}
          /* THE TABLES LISTING IS EVERY ORGANIZATION'S (DATA-HOME-1): "this organization shows
             each member only what is shared" is one organization's setting and would be false
             over a list of eleven. It still speaks on the listings that ARE that organization's. */
          sharedOnly={capability.id === "tables" ? false : sharedOnly}
          open={open[capability.id] ?? false}
          onOpenChange={(next) => setOpen((prev) => ({ ...prev, [capability.id]: next }))}
        />
      ))}

      {/* THE QUEUE, UNDER THE FRONT DOOR RATHER THAN OVER IT. See `inbox` above. */}
      {inbox}

      {/* ARCHIVED ITEMS — one click where you already are, closed by default,
          and the way back is on the row (the archived-items law, 2026-09-09). */}
      <section data-hub-archive className="rounded-lg border border-border bg-card p-3">
        {/* read-gate-exempt: a troubled first read shows no count; a troubled refresh keeps the last count while readTrouble is said inside the list */}
        <ArchivedDisclosure
          noun="tables"
          count={archiveTrouble && archivedTables === null ? undefined : archivedTables?.length}
        >
          <ArchivedTablesList
            tables={archivedTables}
            readTrouble={archiveTrouble}
            note={archiveNote}
            onBringBack={bringBack}
          />
        </ArchivedDisclosure>
        <div className="mt-2">
          <ArchivedPortals />
        </div>
      </section>
    </div>
  );
}
