"use client";

// features/mandates/code-references/UnconvertedCallsPage.tsx
//
// /administration/mandates/unconverted-preview — "Unconverted AI calls": every
// place in our code that calls an AI provider directly instead of through a
// mandate (the code scan's `bypass` references). One row per call site, with
// the exact line one click away on GitHub. Replaces the conversion list on the
// old /administration/mandates/references page (common-docs/systems/mandates/
// OPTIONS.md §2), which stays untouched beside it until the swap.

import Link from "next/link";
import { Copy, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { Muted, TextCell, type EntityColumnSpec } from "@/lib/entity-list/columns";
import type {
  EntityListConfig,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { createMemoryListService } from "@/lib/entity-list/memoryService";
import { toast } from "@/lib/toast";
import {
  UNCONVERTED_STATUS_LABEL,
  fetchUnconvertedCalls,
  type UnconvertedCall,
} from "./data";

type Spec = EntityColumnSpec<UnconvertedCall>;

function copy(text: string, what: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${what}`));
}

function CodeLink({ row }: { row: UnconvertedCall }) {
  const text = row.file || "Not recorded";
  const line = row.line ? `:${row.line}` : "";
  if (!row.codeUrl) return <TextCell value={`${text}${line}`} />;
  return (
    <a
      href={row.codeUrl}
      target="_blank"
      rel="noreferrer"
      title={`${row.location} — open on GitHub`}
      className="block truncate font-mono text-xs text-primary hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      {text}
      <span className="text-muted-foreground">{line}</span>
    </a>
  );
}

const COLUMNS: Spec[] = [
  {
    id: "file",
    label: "File",
    locked: true,
    column: { id: "file", header: "File", filter: "text", width: 420, cell: (row) => <CodeLink row={row} /> },
  },
  {
    id: "calls",
    label: "Calls",
    facet: "calls",
    column: {
      id: "calls",
      header: "Calls",
      filter: "select",
      width: 200,
      cell: (row) =>
        row.calls ? (
          <span className="flex min-w-0 items-baseline gap-1.5" title={row.via ? `${row.via}: ${row.calls}` : row.calls}>
            <span className="truncate font-mono text-xs">{row.calls}</span>
            {row.via ? <span className="shrink-0 text-[11px] text-muted-foreground">{row.via}</span> : null}
          </span>
        ) : (
          <Muted>Not recorded</Muted>
        ),
    },
    formatFacetValue: (value) => (value === "__none__" ? "Not recorded" : value),
  },
  {
    id: "repo",
    label: "Repo",
    facet: "repo",
    column: { id: "repo", header: "Repo", filter: "select", width: 140, cell: (row) => <TextCell value={row.repo} /> },
  },
  {
    id: "language",
    label: "Language",
    facet: "language",
    column: { id: "language", header: "Language", filter: "select", width: 110, cell: (row) => <TextCell value={row.language} /> },
  },
  {
    id: "status",
    label: "Status",
    facet: "status",
    formatFacetValue: (value) => UNCONVERTED_STATUS_LABEL[value as UnconvertedCall["status"]] ?? value,
    column: {
      id: "status",
      header: "Status",
      filter: "select",
      width: 150,
      cell: (row) => (
        <Badge
          variant="outline"
          className={
            row.status === "broken"
              ? "border-red-500/40 text-red-700 dark:text-red-400"
              : "border-amber-500/40 text-amber-700 dark:text-amber-400"
          }
        >
          {UNCONVERTED_STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
  },
  {
    id: "line",
    label: "Line",
    sortWords: { asc: "lowest first", desc: "highest first" },
    defaultHidden: true,
    column: { id: "line", header: "Line", filter: "text", width: 70, cell: (row) => (row.line ? row.line : <Muted>—</Muted>) },
  },
  {
    id: "via",
    label: "How",
    facet: "via",
    defaultHidden: true,
    formatFacetValue: (value) => (value === "__none__" ? "Not recorded" : value),
    column: { id: "via", header: "How", filter: "select", width: 110, cell: (row) => <TextCell value={row.via} muted /> },
  },
  {
    id: "revisionLabel",
    label: "Scanned at",
    facet: "revisionLabel",
    defaultHidden: true,
    column: {
      id: "revisionLabel",
      header: "Scanned at",
      filter: "select",
      width: 150,
      cell: (row) => (
        <span className="truncate text-xs" title={row.revision}>
          {row.revisionLabel} <span className="font-mono text-muted-foreground">{row.revision.slice(0, 7)}</span>
        </span>
      ),
    },
  },
];

function useRowActions(): EntityRowActionsResult<UnconvertedCall> {
  const menuFor = (row: UnconvertedCall) => (): ItemMenuConfig => ({
    sections: [
      {
        id: "open",
        items: row.codeUrl
          ? [{ id: "open-code", label: "Open on GitHub", icon: ExternalLink, kind: "link", href: row.codeUrl, target: "_blank" }]
          : [],
      },
      {
        id: "copy",
        items: [{ id: "copy-location", label: "Copy location", icon: Copy, onSelect: () => copy(row.location, "location") }],
      },
    ],
  });
  return {
    actions: {
      menuFor,
      onOpenRow: (row) => {
        if (row.codeUrl) window.open(row.codeUrl, "_blank", "noopener,noreferrer");
        else copy(row.location, "location");
      },
    },
  };
}

const CONFIG: EntityListConfig<UnconvertedCall> = {
    surfaceKey: "admin-mandates-unconverted-preview",
    entityLabel: { singular: "unconverted AI call", plural: "unconverted AI calls" },
    sourceFeature: "agents-other",
    scopes: ["system"],
    service: createMemoryListService<UnconvertedCall>({
      load: fetchUnconvertedCalls,
      scope: "system",
      defaultSort: "file",
      fields: {
        file: { value: (r) => r.location, search: true },
        calls: { value: (r) => r.calls, facet: true, search: true },
        repo: { value: (r) => r.repo, facet: true, search: true },
        language: { value: (r) => r.language, facet: true },
        status: { value: (r) => r.status, facet: true },
        line: { value: (r) => r.line },
        via: { value: (r) => r.via, facet: true },
        revisionLabel: { value: (r) => r.revisionLabel, facet: true },
      },
    }),
    columns: COLUMNS,
    prefsVersion: 1,
    prefsDefaults: { sort: "file", direction: "asc", pageSize: 50 },
    getRowId: (row) => row.id,
    getRowName: (row) => row.location,
    urlState: true,
    supportsArchived: false,
    tableToolbar: { tableId: "admin-mandates-unconverted-preview" },
    searchPlaceholder: "Search files, repos, providers…",
    useRowActions,
    facetSections: [],
    copy: {
      label: "Unconverted AI call",
      listLabel: "Unconverted AI calls",
      location: "/administration/mandates/unconverted-preview",
      rowKind: "unconverted-ai-call",
      listKind: "unconverted-ai-call-list",
      humanRow: (row) =>
        `${row.location} — calls ${row.calls || "(not recorded)"}; ${UNCONVERTED_STATUS_LABEL[row.status]}`,
      showRow: false,
      showToolbar: false,
    },
    emptyState: {
      title: "No AI calls outside mandates",
      description: "Every AI call the latest scan found runs through a mandate.",
    },
};

export function UnconvertedCallsPage() {
  return (
    <EntityListPage
      config={CONFIG}
      defaultScope={{ kind: "system" }}
      clearsShellHeader={false}
      headerActions={
        <Link
          href="/administration/mandates/health-preview"
          className="whitespace-nowrap rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Mandate health
        </Link>
      }
    />
  );
}
