"use client";

// features/unified-data/home/DataHomeList.tsx — LANE DATA-HOME-3A
//
// THE DATA HOME ON THE CANONICAL LIST SHELL (DATA-HOME-3-SPEC §2). /data-v2 was the only major list
// page that did not use `EntityListPage`; the ten hand-drawn sections had no table, no column sort,
// no title search and no cards. This mounts the shell — the same one /agents/all uses — over one
// row type with a `kind` column, served in hand from the home's one door (`custom.data_home`).
//
// The two organization concepts never touch (common-docs/policies/active-org-is-never-a-list-filter.md):
// the shell's organization filter (`?org_filter=`, All organizations every visit) narrows the list;
// the ACTIVE organization is only where New table lands (the page header, and the making controls
// in the footer). Nothing in this file reads the active organization for a read.

import { useMemo, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Link2, Star, StarOff } from "lucide-react";
import { useRecordsClient } from "@ai-matrx/records/react";
import type { RecordsDataSource } from "@ai-matrx/records";

import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityListConfig, EntityListController, EntityRowActionsResult } from "@/lib/entity-list/config";
import type { EntityFilters } from "@/lib/entity-list/types";
import { makeScope } from "@/lib/list-scope/types";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";

import * as doors from "@/features/unified-data/hub/doors";
import {
  DATA_HOME_DEFAULT_KIND_KNOB,
  DATA_HOME_DEFAULT_ORDER_KNOB,
  DATA_HOME_DEFAULT_SCOPE_KNOB,
  DATA_HOME_SHELL_LANES,
  resolveDataHomeKind,
  resolveDataHomeOrder,
  resolveDataHomeScope,
  ALL_KINDS,
} from "@/features/unified-data/hub/dataHomeScope";
import { ACCESS_WORD, buildDataHomeRows, dataHomeKindWord, type DataHomeAccess, type DataHomeRow } from "./dataHomeRows";
import { createDataHomeService, DATA_HOME_ROW_CAP } from "./dataHomeService";
import { dataHomeColumns, ownerLabel } from "./dataHomeColumns";
import { DataHomeCards, DataHomeRows } from "./DataHomeViews";
import { nextStarred, useDataHomeMarks } from "./useDataHomeMarks";
import { DATA_HOME_DEFAULT_VIEW_KNOB, resolveDataHomeView } from "./dataHomeKnobs";
import { normalize, parseTokens } from "./dataHomeSearch";

export const DATA_HOME_SURFACE_KEY = "data-home";

/** The group header's bucket for a date (Updated grouped). */
export function updatedBucket(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const days = (now - at) / 86_400_000;
  if (days < 1) return "Today";
  if (days < 7) return "This week";
  if (days < 30) return "This month";
  if (days < 365) return "This year";
  return "Older";
}

/** Typed tokens → filter-bag entries, when every token has one (else the service reads them as text). */
export function tokensToFilters(
  search: string,
  known: { kinds: readonly string[]; organizations: ReadonlyArray<{ id: string; name: string }> },
): { search: string; filters: EntityFilters } | null {
  const { text, tokens } = parseTokens(search);
  if (text === search.replace(/\s+/g, " ").trim()) return null;
  const filters: EntityFilters = {};
  if (tokens.kind.length) {
    const values = known.kinds.filter((k) =>
      tokens.kind.some((t) => normalize(k).startsWith(t) || normalize(dataHomeKindWord(k)).startsWith(t)),
    );
    if (values.length === 0) return null;
    filters.kind = { kind: "select", values };
  }
  if (tokens.org.length) {
    const values = known.organizations
      .filter((o) => tokens.org.every((t) => normalize(o.name).includes(t)))
      .map((o) => o.id);
    if (values.length === 0) return null;
    filters.organization = { kind: "select", values };
  }
  if (tokens.owner.length) {
    if (!tokens.owner.every((t) => t === "me")) return null;
    filters.owner = { kind: "select", values: ["You"] };
  }
  if (tokens.starred) filters.favorite = { kind: "boolean", value: true };
  if (tokens.updated) filters.updated = { kind: "select", values: [tokens.updated] };
  if (tokens.titleOnly) filters.title_only = { kind: "boolean", value: true };
  return { search: text ? `${text} ` : "", filters };
}

export interface DataHomeListProps {
  dataSource: RecordsDataSource;
  /** Header slot for nothing; the page owns the header. Footer: making, inbox, archive. */
  footer?: ReactNode;
  /** The organization the page's filter names, when it shows only a member what is shared. */
  sharedOnlyHere?: boolean;
}

export function DataHomeList({ dataSource, footer, sharedOnlyHere = false }: DataHomeListProps) {
  const router = useRouter();
  const client = useRecordsClient();
  const userId = useAppSelector(selectUserId);
  const marks = useDataHomeMarks();

  // A person's own marks, read through a ref so a star re-sorts on the next ask without making a
  // new service (and a new load) per click.
  const starredRef = useRef<Set<string>>(new Set(marks.starred));
  starredRef.current = new Set(marks.starred);

  // What the load learned, for the columns' words and the tokens (organization names, kinds).
  const knownRef = useRef<{ kinds: string[]; organizations: Array<{ id: string; name: string }>; names: Map<string, string> }>({
    kinds: [],
    organizations: [],
    names: new Map(),
  });
  const refusalsRef = useRef<Array<{ listing: string; message: string }>>([]);
  const cappedRef = useRef(false);

  const service = useMemo(
    () =>
      createDataHomeService({
        isStarred: (row) => starredRef.current.has(row.id),
        ownerLabel,
        load: async () => {
          // ONE CALL FOR THE WHOLE HOME, every organization; the organization filter narrows in hand.
          const answered = await doors.dataHome(dataSource, null);
          if (!answered.ok) {
            throw new Error(`Could not read tables. Nothing is hidden by this. ${answered.error.message}`);
          }
          const built = await buildDataHomeRows({ client, dataSource, answer: answered.data });
          refusalsRef.current = built.refusals.map((r) => ({ listing: r.listing, message: r.error.message }));
          let rows = built.rows;
          // THE STATED BOUND: past it the newest rows are kept and the page says so.
          cappedRef.current = rows.length > DATA_HOME_ROW_CAP;
          if (cappedRef.current) {
            rows = [...rows]
              .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
              .slice(0, DATA_HOME_ROW_CAP);
          }
          const names = new Map<string, string>();
          for (const row of rows) if (row.organizationId && row.organizationName) names.set(row.organizationId, row.organizationName);
          knownRef.current = {
            kinds: [...new Set(rows.map((r) => r.kind))],
            organizations: [...names.entries()].map(([id, name]) => ({ id, name })),
            names,
          };
          return rows;
        },
      }),
    [client, dataSource],
  );

  // Defaults stay knobs (person / platform tier; never the active organization).
  const defaultScope = resolveDataHomeScope(null, useEffectiveKnob(null, userId, DATA_HOME_DEFAULT_SCOPE_KNOB));
  const defaultKind = resolveDataHomeKind(null, useEffectiveKnob(null, userId, DATA_HOME_DEFAULT_KIND_KNOB));
  const order = resolveDataHomeOrder(useEffectiveKnob(null, userId, DATA_HOME_DEFAULT_ORDER_KNOB));
  const defaultView = resolveDataHomeView(useEffectiveKnob(null, userId, DATA_HOME_DEFAULT_VIEW_KNOB));

  const config = useMemo<EntityListConfig<DataHomeRow>>(() => {
    const columns = dataHomeColumns({ organizationName: (id) => knownRef.current.names.get(id) ?? id });
    return {
      surfaceKey: DATA_HOME_SURFACE_KEY,
      entityLabel: { singular: "table", plural: "tables" },
      sourceFeature: "udt",
      scopes: [...DATA_HOME_SHELL_LANES],
      // No person can reach the platform's own tables from the data home today (the door reads only
      // organizations the viewer belongs to or holds a grant in), so System is absent, not empty.
      lanes: { system: false },
      service,
      columns,
      prefsVersion: 1,
      prefsDefaults: {
        view: defaultView,
        density: "compact",
        sort: order === "name" ? "name" : "updated",
        direction: order === "name" ? "asc" : "desc",
        favoritesFirst: true,
      },
      getRowId: (row) => row.id,
      getRowName: (row) => row.name,
      door: { column: "name", hrefFor: (row) => row.href },
      useRowActions: (list) => useDataHomeRowActions(list, starredRef, marks, router),
      favorite: {
        isFavorite: (row) => starredRef.current.has(row.id),
        canToggle: () => true,
      },
      supportsArchived: false,
      facetSections: [
        { facet: "kind", filterId: "kind", label: "Kind", noneLabel: "None", countInLabel: false, formatValue: dataHomeKindWord },
        {
          facet: "organization",
          filterId: "organization",
          label: "Organization",
          noneLabel: "None",
          countInLabel: false,
          formatValue: (id) => knownRef.current.names.get(id) ?? id,
        },
        {
          facet: "access",
          filterId: "access",
          label: "Access",
          noneLabel: "None",
          countInLabel: false,
          formatValue: (v) => ACCESS_WORD[v as DataHomeAccess] ?? v,
        },
      ],
      noneLabels: { owner: "—", records: "Not counted", organization: "None", access: "None" },
      searchPlaceholder: "Search tables, forms, dashboards",
      searchToggles: [{ id: "title_only", label: "Title only" }],
      searchTokens: (search) => tokensToFilters(search, knownRef.current),
      filterChips: true,
      ...(defaultKind !== ALL_KINDS ? { defaultFilters: { kind: { kind: "select", values: [defaultKind] } } } : {}),
      grouping: {
        groupableColumnIds: ["kind", "organization", "access", "owner", "updated"],
        rowNoun: "item",
        readCell: (row, columnId) =>
          columnId === "updated"
            ? updatedBucket(row.updatedAt)
            : columnId === "owner"
              ? ownerLabel(row)
              : columnId === "organization"
                ? row.organizationName
                : columnId === "kind"
                  ? row.kind
                  : columnId === "access"
                    ? row.access
                    : null,
        labelOf: (columnId, value) =>
          value === null || value === undefined || value === ""
            ? "—"
            : columnId === "kind"
              ? dataHomeKindWord(String(value))
              : columnId === "access"
                ? (ACCESS_WORD[value as DataHomeAccess] ?? String(value))
                : String(value),
      },
      virtualize: { enabled: true, threshold: 150, overscan: 8 },
      views: {
        cards: (p) => (
          <DataHomeCards {...p} isStarred={(row) => starredRef.current.has(row.id)} onOpened={(row) => marks.opened(row.id)} />
        ),
        rows: (p) => (
          <DataHomeRows {...p} isStarred={(row) => starredRef.current.has(row.id)} onOpened={(row) => marks.opened(row.id)} />
        ),
      },
      emptyState: sharedOnlyHere
        ? {
            title: "Nothing shared with you here yet",
            description: "Here you see only tables shared with you. Ask the table's keeper to share it.",
          }
        : { title: "No tables yet", description: "New table makes one." },
    };
    // `marks` changes identity every render; the hook reads it through the closure at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, order, defaultView, defaultKind, sharedOnlyHere, router]);

  return (
    <EntityListPage
      config={config}
      defaultScope={makeScope(defaultScope)}
      clearsShellHeader={false}
      notice={() =>
        refusalsRef.current.length > 0 || cappedRef.current ? (
          <div role="status" className="flex flex-col gap-1 text-xs text-muted-foreground" data-data-home-notice="">
            {cappedRef.current ? <span>Showing the newest {DATA_HOME_ROW_CAP.toLocaleString()}.</span> : null}
            {refusalsRef.current.map((r) => (
              <span key={r.listing} className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                {r.listing} could not be read. {r.message}
                <ErrorAlchemyMenu error={r.message} />
              </span>
            ))}
          </div>
        ) : null
      }
      footer={footer}
    />
  );
}

function useDataHomeRowActions(
  list: EntityListController<DataHomeRow>,
  starredRef: { current: Set<string> },
  marks: ReturnType<typeof useDataHomeMarks>,
  router: ReturnType<typeof useRouter>,
): EntityRowActionsResult<DataHomeRow> {
  const toggle = (row: DataHomeRow) => {
    const { next, refused } = nextStarred([...starredRef.current], row.id);
    if (refused) {
      toast.error("You can star up to 500. Unstar one first.");
      return;
    }
    starredRef.current = new Set(next);
    marks.toggleStar(row.id);
    list.refresh();
  };
  return {
    actions: {
      onOpenRow: (row) => {
        marks.opened(row.id);
        router.push(row.href);
      },
      onToggleFavorite: toggle,
      menuFor: (row) => (): ItemMenuConfig => {
        const starred = starredRef.current.has(row.id);
        return {
          sections: [
            {
              id: "open",
              items: [
                { id: "open", kind: "link", label: "Open", href: row.href },
                { id: "open-tab", kind: "link", label: "Open in new tab", icon: ExternalLink, href: row.href, target: "_blank" },
                ...(row.publicHref
                  ? [{ id: "public", kind: "link" as const, label: "Open public link", icon: Link2, href: row.publicHref, target: "_blank" as const }]
                  : []),
              ],
            },
            {
              id: "mark",
              items: [
                {
                  id: "star",
                  label: starred ? "Unstar" : "Star",
                  icon: starred ? StarOff : Star,
                  onSelect: () => toggle(row),
                },
              ],
            },
          ],
        };
      },
    },
  };
}
