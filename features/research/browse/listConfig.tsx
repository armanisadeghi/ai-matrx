"use client";

// features/research/browse/listConfig.tsx
//
// /research/topics as a canonical entity list: scope tabs (Mine / My orgs with
// a per-organization narrow), search, sort and filter on every column, saved
// view preferences, one row menu for kebab / right-click / long-press, and a
// door on every topic name.
//
// No archive axis: `research.rs_topic` has no archive column; removing a topic
// is the soft delete the row menu names.

import type { EntityListConfig } from "@/lib/entity-list/config";
import { RESEARCH_TOPIC_COLUMNS, formatAutonomy, formatTopicStatus } from "./columns";
import { organizationLabel, projectLabel, researchTopicListService } from "./service";
import { useTopicRowActions } from "./useTopicRowActions";
import {
  RESEARCH_TOPIC_LIST_SCOPES,
  TOPIC_STATUS_LABELS,
  labelFor,
  topicHref,
  type ResearchTopicListRow,
} from "./types";

export const RESEARCH_TOPIC_LIST_CONFIG: EntityListConfig<ResearchTopicListRow> = {
  surfaceKey: "research-topics",
  entityLabel: { singular: "topic", plural: "topics" },
  sourceFeature: "research",
  scopes: RESEARCH_TOPIC_LIST_SCOPES,
  // `research_topic` is registered `organization`: the list opens on the
  // organization's topics, not a literal "Mine".
  registryToken: "research_topic",
  service: researchTopicListService,
  columns: RESEARCH_TOPIC_COLUMNS,
  prefsVersion: 2,
  prefsDefaults: { sort: "updated_at", direction: "desc", pageSize: 50 },
  getRowId: (row) => row.id,
  getRowName: (row) => row.name,
  door: { token: "research_topic", hrefFor: (row) => topicHref(row.id) },
  getRowEntity: (row) => ({
    type: "research_topic",
    id: row.id,
    title: row.name,
  }),
  useRowActions: useTopicRowActions,
  supportsArchived: false,
  searchPlaceholder: "Search topics and research questions",
  facetSections: [
    {
      facet: "status",
      filterId: "status",
      label: "Status",
      noneLabel: "Unknown",
      formatValue: formatTopicStatus,
    },
    {
      facet: "project",
      filterId: "project",
      label: "Project",
      noneLabel: "No project",
      formatValue: projectLabel,
    },
    {
      facet: "organization_name",
      filterId: "organization_name",
      label: "Organization",
      noneLabel: "No organization",
      formatValue: organizationLabel,
    },
    {
      facet: "autonomy_level",
      filterId: "autonomy_level",
      label: "Autonomy",
      noneLabel: "Unknown",
      formatValue: formatAutonomy,
    },
  ],
  noneLabels: {
    status: "Unknown",
    project: "No project",
    autonomy_level: "Unknown",
  },
  copy: {
    label: "Research topic",
    listLabel: "Research topics",
    location: "/research/topics",
    rowKind: "research-topic",
    listKind: "research-topic-list",
    rowDescription:
      "One research topic: its name, research question, status and project. Metadata only; no gathered sources or reports.",
    listDescription:
      "The research topics list as currently scoped, filtered and sorted. Metadata only.",
    humanRow: (row) =>
      `${row.name} — ${labelFor(TOPIC_STATUS_LABELS, row.status)}${
        row.project_name ? `, project ${row.project_name}` : ""
      }${row.description ? `\n${row.description}` : ""}`,
    showRow: false,
    showToolbar: false,
  },
  emptyState: {
    title: "No research topics",
    description:
      "A research topic is a question worth answering. It gathers sources, analyzes them and writes up what matters.",
  },
};
