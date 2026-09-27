"use client";

// features/education/assessment/components/home/assessmentList.tsx
//
// /education/quizzes and /education/practice-tests expressed as an
// entity-list config — the canonical list shell (lib/entity-list) instead of
// the hand-built card list it replaced (page-pass 2026-09-27). The shell brings
// sort and filter on every column, saved view preferences, scope lanes with
// real counts, the archive axis, a per-row right-click menu, Copy / Copy for
// AI, and phone cards. Worked example: features/flashcards/components/home/.
//
// SERVICE: every read is server-side — `education.assessment_list_scoped` /
// `_counts` / `_facets` (../../data/assessmentListService.ts). The browser only
// ever holds the page on screen.
//
// LANES (THE VIEW LAW — RLS is the ceiling, the lane is declared in the RPC):
//   mine   → created_by = me
//   orgs   → someone else's assessment, visibility >= internal, in one of MY orgs
//   shared → someone else's assessment granted to me or my orgs (iam.permissions)
//   public → someone else's public assessment

import type { EntityListConfig } from "@/lib/entity-list/config";
import type { EntityColumnSpec } from "@/lib/entity-list/columns";
import { Muted, TextCell, timeCell } from "@/lib/entity-list/columns";
import type {
  EntityFacets,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
} from "@/lib/entity-list/types";
import type { ListScopeKind } from "@/lib/list-scope/types";
import { visibilityWords } from "@/lib/record-words";
import { PlayTapButton } from "@ai-matrx/tap-target/buttons";
import {
  fetchAssessmentFacets,
  fetchAssessmentLaneCounts,
  fetchAssessmentPage,
  type AssessmentLane,
  type AssessmentListQuery,
  type AssessmentListRow,
} from "../../data/assessmentListService";
import type { KindConfig } from "../kindConfig";

/** One row of the library plus the archive flag the shell files it by. */
export interface AssessmentListItem extends AssessmentListRow {
  archived: boolean;
}

export const ASSESSMENT_SCOPES: ListScopeKind[] = ["mine", "orgs", "shared", "public"];

export const assessmentHref = (config: KindConfig, row: { id: string }) =>
  `/education/${config.base}/${row.id}`;
export const assessmentTakeHref = (config: KindConfig, row: { id: string }) =>
  `/education/${config.base}/${row.id}?start=1`;

const VISIBILITY_LABELS: Record<string, string> = {
  personal: "Only me",
  internal: "Organization",
  link: "Anyone with link",
  public: "Public",
};
export const visibilityLabel = (value: string) => VISIBILITY_LABELS[value] ?? value;

const DEPTH_LABELS: Record<string, string> = {
  recall: "Recall",
  applied: "Applied",
  exam: "Exam level",
  __none__: "Not set",
};
export const depthLabel = (value: string) => DEPTH_LABELS[value] ?? value;

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  generating: "Generating",
  ready: "Ready",
  error: "Failed",
};
export const statusLabel = (value: string) => STATUS_LABELS[value] ?? value;

const examLabel = (value: string) => (value === "__none__" ? "No exam" : value);

/**
 * The topic, only when it says something the title does not — a quiz made
 * from a document usually carries the document's name as both.
 */
export function distinctTopic(row: { title: string; topic: string | null }): string | null {
  const topic = row.topic?.trim();
  if (!topic) return null;
  return topic.toLowerCase() === row.title.trim().toLowerCase() ? null : topic;
}

function toQuery(kind: KindConfig["kind"], query: EntityListQuery): AssessmentListQuery {
  const scope = query.scope;
  return {
    kind,
    lane: (ASSESSMENT_SCOPES.includes(scope.kind) ? scope.kind : "mine") as AssessmentLane,
    orgId: scope.kind === "orgs" ? scope.organizationId : null,
    search: query.search.trim(),
    filters: query.filters,
    archived: query.archived,
  };
}

function buildService(
  kind: KindConfig["kind"],
): EntityListConfig<AssessmentListItem>["service"] {
  return {
    async fetchPage(query: EntityListQuery, sort: EntityListSort) {
      const page = await fetchAssessmentPage(toQuery(kind, query), {
        sort: sort.sort,
        ascending: sort.direction === "asc",
        limit: sort.pageSize,
        offset: Math.max(0, (query.page - 1) * sort.pageSize),
      });
      return {
        rows: page.rows.map((r) => ({ ...r, archived: r.deleted_at !== null })),
        total: page.total,
      };
    },
    async fetchCounts(query: EntityListQuery): Promise<EntityScopeCounts> {
      const { lane: _lane, orgId: _org, ...rest } = toQuery(kind, query);
      return { byKind: await fetchAssessmentLaneCounts(rest), narrow: {} };
    },
    async fetchFacets(query: EntityListQuery): Promise<EntityFacets> {
      return { byKind: await fetchAssessmentFacets(toQuery(kind, query)) };
    },
  };
}

function TakeCell({ row, config }: { row: AssessmentListItem; config: KindConfig }) {
  if (row.archived) return <Muted>Archived</Muted>;
  if (row.question_count === 0) return <Muted>No questions</Muted>;
  return (
    // The row itself opens the assessment; Take is its own door.
    <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
      <PlayTapButton
        href={assessmentTakeHref(config, row)}
        variant="transparent"
        tooltip={`Take ${config.noun}`}
        ariaLabel={`Take ${row.title}`}
      />
    </span>
  );
}

export function buildAssessmentColumns(
  config: KindConfig,
): EntityColumnSpec<AssessmentListItem>[] {
  return [
    {
      id: "title",
      label: "Title",
      locked: true,
      phone: "title",
      column: {
        id: "title",
        width: 420,
        className: "max-w-[26rem] overflow-hidden",
        accessorKey: "title",
        header: "Title",
        filter: "text",
        href: (row) => assessmentHref(config, row),
        entityToken: "assessment",
        cell: (row) => <TextCell value={row.title} className="font-medium" />,
      },
    },
    {
      id: "topic",
      label: "Topic",
      phone: "primary",
      column: {
        id: "topic",
        width: 220,
        className: "max-w-[14rem] overflow-hidden",
        accessorKey: "topic",
        header: "Topic",
        filter: "text",
        cell: (row) => {
          const topic = distinctTopic(row);
          return topic ? <TextCell value={topic} /> : <Muted>—</Muted>;
        },
      },
    },
    {
      id: "questions",
      label: "Questions",
      phone: "meta",
      sortWords: { asc: "fewest first", desc: "most first" },
      column: {
        id: "questions",
        accessorKey: "question_count",
        header: "Questions",
        filter: false,
        cell: (row) => <span className="tabular-nums">{row.question_count}</span>,
      },
    },
    {
      id: "depth",
      label: "Depth",
      facet: "depth",
      formatFacetValue: depthLabel,
      phone: "rest",
      column: {
        id: "depth",
        accessorKey: "depth",
        header: "Depth",
        filter: "select",
        cell: (row) =>
          row.depth ? <span>{depthLabel(row.depth)}</span> : <Muted>—</Muted>,
      },
    },
    {
      id: "exam_type",
      label: "Exam",
      facet: "exam_type",
      formatFacetValue: examLabel,
      phone: "rest",
      column: {
        id: "exam_type",
        accessorKey: "exam_type",
        header: "Exam",
        filter: "select",
        cell: (row) => (row.exam_type ? <TextCell value={row.exam_type} /> : <Muted>—</Muted>),
      },
    },
    {
      id: "status",
      label: "Status",
      facet: "status",
      formatFacetValue: statusLabel,
      defaultHidden: true,
      column: {
        id: "status",
        accessorKey: "status",
        header: "Status",
        filter: "select",
        cell: (row) => <span>{statusLabel(row.status)}</span>,
      },
    },
    {
      id: "description",
      label: "Description",
      defaultHidden: true,
      column: {
        id: "description",
        accessorKey: "description",
        header: "Description",
        filter: "text",
        cell: (row) => <TextCell value={row.description} />,
      },
    },
    {
      id: "visibility",
      label: "Who can see it",
      facet: "visibility",
      formatFacetValue: visibilityLabel,
      defaultHidden: true,
      column: {
        id: "visibility",
        accessorKey: "visibility",
        header: "Who can see it",
        filter: "select",
        cell: (row) => (
          <span className="block truncate" title={visibilityWords(row.visibility) ?? undefined}>
            {visibilityLabel(row.visibility)}
          </span>
        ),
      },
    },
    {
      id: "updated",
      label: "Last edited",
      phone: "meta",
      column: {
        id: "updated",
        accessorKey: "updated_at",
        header: "Last edited",
        filter: false,
        cell: (row) => timeCell(row.updated_at),
      },
    },
    {
      id: "created",
      label: "Created",
      defaultHidden: true,
      column: {
        id: "created",
        accessorKey: "created_at",
        header: "Created",
        filter: false,
        cell: (row) => timeCell(row.created_at),
      },
    },
    {
      id: "take",
      label: "Take",
      locked: true,
      phone: "primary",
      column: {
        id: "take",
        header: "Take",
        filter: false,
        sortable: false,
        cell: (row) => <TakeCell row={row} config={config} />,
      },
    },
  ];
}

export function buildAssessmentListConfig(input: {
  config: KindConfig;
  userId: string;
  useRowActions: EntityListConfig<AssessmentListItem>["useRowActions"];
}): EntityListConfig<AssessmentListItem> {
  const { config } = input;
  const plural = config.pluralLabel.toLowerCase();
  return {
    surfaceKey: `education-assessments-${config.base}`,
    // Where the list OPENS comes from platform.entity_types (assessment),
    // never a literal.
    registryToken: "assessment",
    entityLabel: { singular: config.noun, plural },
    sourceFeature: "education-assessment",
    scopes: ASSESSMENT_SCOPES,
    service: buildService(config.kind),
    serviceKey: `${input.userId}:${config.kind}`,
    columns: buildAssessmentColumns(config),
    prefsVersion: 1,
    prefsDefaults: { sort: "updated", direction: "desc" },
    getRowId: (row) => row.id,
    getRowName: (row) => row.title,
    getRowEntity: (row) => ({
      type: "assessment",
      id: row.id,
      title: row.title,
      resourceType: "assessment",
    }),
    door: {
      token: "assessment",
      column: "title",
      hrefFor: (row) => assessmentHref(config, row),
    },
    useRowActions: input.useRowActions,
    searchPlaceholder: `Search ${plural} by title, topic, exam or description…`,
    facetSections: [
      { facet: "depth", filterId: "depth", label: "Depth", noneLabel: "Not set", formatValue: depthLabel },
      { facet: "exam_type", filterId: "exam_type", label: "Exam", noneLabel: "No exam", formatValue: examLabel },
      { facet: "visibility", filterId: "visibility", label: "Who can see it", noneLabel: "Not set", formatValue: visibilityLabel },
    ],
    copy: {
      label: config.label,
      listLabel: config.pluralLabel,
      location: `/education/${config.base}`,
      rowKind: `education-${config.kind}`,
      listKind: `education-${config.kind}-list`,
      humanRow: (row) =>
        [
          row.title,
          distinctTopic(row) ?? "",
          `${row.question_count} questions`,
          row.depth ? depthLabel(row.depth) : "",
          row.exam_type ?? "",
          `edited ${row.updated_at.slice(0, 10)}`,
        ]
          .filter(Boolean)
          .join(" · "),
      showRow: false,
      showToolbar: false,
    },
    emptyState: {
      title: `No ${plural} yet`,
      description: `A ${config.noun} is a set of graded questions generated from a topic, a flashcard deck or a document.`,
    },
  };
}
