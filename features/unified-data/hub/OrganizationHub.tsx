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
import Link from "next/link";
import { useRouter } from "next/navigation";
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

/** The organization's member-visibility setting, at its one registry address. */
const MEMBER_VISIBILITY = { feature: "custom", key: "member_default_visibility" } as const;

import {
  HUB_CAPABILITIES,
  LANE_EMPTY_SENTENCE,
  SHARED_ONLY_EMPTY,
  attachChangedBy,
  type HubItem,
  type HubReadContext,
} from "./capabilities";
import { HubListing, type HubListingState } from "./HubListing";
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
  const client = useRecordsClient();
  const tablesRead = useTables();
  const tables = useMemo<readonly Table[]>(() => tablesRead.data ?? [], [tablesRead.data]);

  const [lane, setLane] = useState<VisibilityLane | null>(null);
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
  const [restoring, setRestoring] = useState<string | null>(null);

  // EVERY CAPABILITY, ONE CALL EACH, IN PARALLEL. Ten doors, ten round trips
  // for the whole organization — not ten per table.
  useEffect(() => {
    if (tablesRead.loading) return;
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
  }, [client, dataSource, organizationId, tables, tablesRead.loading]);

  // THE ARCHIVE, through the store's own archived door over the Table kernel —
  // the same door a table's own archive uses, addressed at the kernel that
  // holds every Table, so it is one call and not one per table.
  const readArchive = useCallback(async () => {
    const kernel = await doors.tableKernelId(dataSource);
    if (!kernel.ok) {
      setArchiveTrouble(kernel.error.message);
      return;
    }
    const answered = await client.listArchived({ table_id: kernel.data, lane: "org", limit: 100 });
    if (!answered.ok) {
      setArchiveTrouble(answered.error.message);
      return;
    }
    setArchiveTrouble(null);
    setArchivedTables(
      answered.data.rows.map((row) => ({
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
  const filtered = useMemo(() => {
    const out: Record<string, HubListingState> = {};
    for (const [id, state] of Object.entries(states)) {
      out[id] =
        state.phase === "read" && lane
          ? { phase: "read", items: state.items.filter((item) => item.lane === lane) }
          : state;
    }
    return out;
  }, [states, lane]);

  /** THE NEWEST THREE THINGS, computed from what the doors actually returned. */
  const newest = useMemo<Array<HubItem & { capability: string }>>(() => {
    const all: Array<HubItem & { capability: string }> = [];
    for (const capability of HUB_CAPABILITIES) {
      const state = filtered[capability.id];
      if (state?.phase !== "read") continue;
      for (const item of state.items) {
        if (item.changedAt) all.push({ ...item, capability: capability.title });
      }
    }
    all.sort((a, b) => (b.changedAt ?? "").localeCompare(a.changedAt ?? ""));
    return all.slice(0, 3);
  }, [filtered]);

  return (
    <div data-hub-root className="space-y-4">
      {/* START HERE — the walkthrough, and the three newest things, which are read
          off the same doors as everything below rather than written down here. */}
      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
          <span className="text-sm font-medium text-foreground">Start here</span>
          <Link
            href="/data-v2/try-everything"
            className="text-xs text-foreground underline underline-offset-2"
          >
            Try everything on one page
          </Link>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            every part of the record store, with the unfinished parts named
          </span>
        </div>
        <div className="border-t border-border px-3 py-2">
          {newest.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {/* THREE DIFFERENT EMPTIES, three different sentences (VERIFIER-16
                  M6 + the shared-only member): a lane with nothing in it, an
                  organization that shows this member only what is shared with
                  them, and an organization with genuinely nothing yet. */}
              {lane
                ? LANE_EMPTY_SENTENCE[lane]
                : sharedOnly
                  ? SHARED_ONLY_EMPTY
                  : "Nothing has been made here yet. Make a table below and everything else — forms, boards, dashboards, digests — hangs off it."}
            </p>
          ) : (
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <li className="text-xs text-muted-foreground">Newest:</li>
              {newest.map((item) => (
                <li key={`${item.capability}:${item.id}`} className="min-w-0">
                  <Link
                    href={item.href}
                    className="text-xs text-foreground underline underline-offset-2"
                  >
                    {item.title}
                  </Link>
                  {/* THE NAME AND WHAT IT IS ARE TWO THINGS. Without a separator
                      they set in the same size and flow, so "Jobs" followed by
                      "Tables" read as one name — "Jobs Tables" (VERIFIER-14 §4).
                      The middot is the one the rows already use between facts. */}
                  <span className="text-xs text-muted-foreground">
                    {" · "}
                    {item.capability}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* THE LANES, AS FILTERS AND NEVER A FLAT LIST. The words are the package's. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Show</span>
        <button
          type="button"
          data-hub-lane="everything"
          onClick={() => setLane(null)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs transition-colors",
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
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              lane === candidate
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-muted/50",
            )}
          >
            {VISIBILITY_LANE_TITLE[candidate]}
          </button>
        ))}
      </div>

      {HUB_CAPABILITIES.map((capability) => (
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

      {/* THE QUEUE, UNDER THE FRONT DOOR RATHER THAN OVER IT. See `inbox` above. */}
      {inbox}

      {/* ARCHIVED ITEMS — one click where you already are, closed by default,
          and the way back is on the row (the archived-items law, 2026-09-09). */}
      <section data-hub-archive className="rounded-lg border border-border bg-card p-3">
        <ArchivedDisclosure noun="tables" count={archivedTables?.length}>
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
