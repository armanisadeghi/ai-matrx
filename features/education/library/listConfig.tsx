"use client";

import type { EntityListConfig } from "@/lib/entity-list/config";
import { EducationLibraryCards } from "./components/EducationLibraryCards";
import { EducationLibraryRows } from "./components/EducationLibraryRows";
import { EDUCATION_LIBRARY_COLUMNS } from "./columns";
import {
  fetchEducationLibraryCounts,
  fetchEducationLibraryFacets,
  fetchEducationLibraryPage,
} from "./service";
import {
  EDUCATION_LIBRARY_KIND_LABELS,
  EDUCATION_LIBRARY_SCOPES,
  EDUCATION_LIBRARY_SUBTYPE_LABELS,
  educationLibraryHref,
  type EducationLibraryKind,
  type EducationLibraryRow,
} from "./types";
import { useEducationLibraryRowActions } from "./useEducationLibraryRowActions";

export const educationLibraryListConfig: EntityListConfig<EducationLibraryRow> =
  {
    surfaceKey: "education-library",
    entityLabel: { singular: "study item", plural: "study items" },
    sourceFeature: "education-ingest",
    scopes: EDUCATION_LIBRARY_SCOPES,
    service: {
      fetchPage: fetchEducationLibraryPage,
      fetchCounts: fetchEducationLibraryCounts,
      fetchFacets: fetchEducationLibraryFacets,
    },
    columns: EDUCATION_LIBRARY_COLUMNS,
    // v2: the student-facing columns (items / progress / due / last studied /
    // topic / source) landed together with the card + row views. The bump
    // re-seeds column selection so existing learners actually get them — a
    // stored `hiddenColumns: []` predates the columns and would otherwise win.
    prefsVersion: 2,
    prefsDefaults: {
      sort: "updated",
      direction: "desc",
      // Cards, not the table. This is a study library: a learner picking what
      // to work on next reads shape, size, and progress far faster than a grid
      // of text. The table is one click away and keeps every column.
      view: "cards",
    },
    urlState: true,
    getRowId: (row) => row.id,
    getRowName: (row) => row.title,
    door: { hrefFor: educationLibraryHref },
    getRowEntity: (row) => {
      if (
        row.kind !== "fc_set" &&
        row.kind !== "assessment" &&
        row.kind !== "study_media" &&
        row.kind !== "note"
      ) {
        return undefined;
      }
      return {
        type: row.kind,
        id: row.id,
        title: row.title,
        resourceType: row.kind,
        isOwner: row.is_owner,
      };
    },
    useRowActions: useEducationLibraryRowActions,
    supportsArchived: false,
    facetSections: [
      {
        facet: "kind",
        filterId: "kind",
        label: "Type",
        noneLabel: "Unknown type",
        countInLabel: false,
        formatValue: (value) =>
          EDUCATION_LIBRARY_KIND_LABELS[value as EducationLibraryKind] ?? value,
      },
      {
        facet: "subtype",
        filterId: "subtype",
        label: "Format",
        noneLabel: "Unknown format",
        countInLabel: false,
        formatValue: (value) =>
          EDUCATION_LIBRARY_SUBTYPE_LABELS[value] ?? value.replaceAll("_", " "),
      },
      {
        facet: "status",
        filterId: "status",
        label: "Status",
        noneLabel: "No status",
        countInLabel: false,
      },
      {
        facet: "visibility",
        filterId: "visibility",
        label: "Visibility",
        noneLabel: "No visibility",
        countInLabel: false,
      },
    ],
    noneLabels: { status: "No status" },
    /**
     * Three views, cards first. The library shipped table-only, which rendered
     * eight visually distinct study formats as identical grey rows and could
     * not show size, coverage, accuracy, or what is due — the four facts a
     * learner decides on. `useListViewPrefs` remembers the choice per user, so
     * the table remains one click away for anyone who wants to sort and filter.
     */
    views: {
      cards: (p) => (
        <EducationLibraryCards
          rows={p.rows}
          density={p.density}
          showShared={p.showShared}
          menuFor={p.actions.menuFor}
          hrefFor={p.hrefFor}
        />
      ),
      rows: (p) => (
        <EducationLibraryRows
          rows={p.rows}
          density={p.density}
          showShared={p.showShared}
          menuFor={p.actions.menuFor}
          hrefFor={p.hrefFor}
        />
      ),
    },
    emptyState: {
      title: "No study items here yet",
      description:
        "Create a study kit to add flashcards, quizzes, summaries, audio, mind maps, memory aids, and notes to your Library.",
    },
  };
