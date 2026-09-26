"use client";

// features/mandates/code-references/MandateHealthPage.tsx
//
// /administration/intelligence/mandates/health (ADMIN_MANDATES_HEALTH) — "Mandate health": every open way a
// mandate is broken, one row per finding: how bad, which mandate, what is
// wrong in plain words, where in the code, and the fix. Merges the old
// references page's open findings with code ↔ database drift (./health.ts).
// The old /administration/mandates/references page stays untouched beside it.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { Muted, TextCell, type EntityColumnSpec } from "@/lib/entity-list/columns";
import type {
  EntityListConfig,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import type { ItemMenuConfig, ItemMenuEntry } from "@/components/official/item/types";
import { createMemoryListService } from "@/lib/entity-list/memoryService";
import { EntitySourceFailures } from "@/lib/entity-list/components/EntitySourceFailures";
import { plainFailureReason } from "@/lib/entity-list/failure";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { AppDispatch } from "@/lib/redux/store";
import { toast } from "@/lib/toast";
import { ADMIN_MANDATES_HEALTH } from "@/features/mandates/admin-routes";
import {
  KIND_LABEL,
  SEVERITY_LABEL,
  SEVERITY_RANK,
  SOURCE_LABEL,
  UNCONVERTED_PATH,
  fetchMandateHealth,
  type HealthFinding,
  type HealthLoad,
} from "./health";

type Spec = EntityColumnSpec<HealthFinding>;

/** A finding with no mandate: an AI call outside every mandate, or a call whose mandate the scan cannot read. */
function noMandateWord(row: HealthFinding): string {
  return row.fixHref === UNCONVERTED_PATH ? "No mandate" : "Unreadable";
}

function copy(text: string, what: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${what}`));
}

const SEVERITY_CLASS: Record<HealthFinding["severity"], string> = {
  high: "border-red-500/40 text-red-700 dark:text-red-400",
  medium: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  low: "border-border text-muted-foreground",
};

const COLUMNS: Spec[] = [
  {
    id: "severity",
    label: "Severity",
    facet: "severity",
    formatFacetValue: (v) => SEVERITY_LABEL[v as HealthFinding["severity"]] ?? v,
    sortWords: { asc: "least severe first", desc: "most severe first" },
    column: {
      id: "severity",
      header: "Severity",
      filter: "select",
      width: 96,
      cell: (row) => (
        <Badge variant="outline" className={SEVERITY_CLASS[row.severity]}>
          {SEVERITY_LABEL[row.severity]}
        </Badge>
      ),
    },
  },
  {
    id: "mandate",
    label: "Mandate",
    facet: "mandate",
    
    column: {
      id: "mandate",
      header: "Mandate",
      filter: "select",
      width: 200,
      cell: (row) =>
        row.mandateKey ? (
          row.fixHref ? (
            <Link
              href={row.fixHref}
              title={row.mandateKey}
              className="block truncate hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {row.mandateName}
            </Link>
          ) : (
            <span className="block truncate" title={row.mandateKey}>
              {row.mandateName}
            </span>
          )
        ) : (
          <Muted>{noMandateWord(row)}</Muted>
        ),
    },
  },
  {
    id: "problem",
    label: "Problem",
    locked: true,
    column: {
      id: "problem",
      header: "Problem",
      filter: "text",
      width: 360,
      cell: (row) => (
        <span className="block truncate" title={row.detail ? `${row.problem} — ${row.detail}` : row.problem}>
          {row.problem}
          {row.detail ? <span className="text-muted-foreground"> · {row.detail}</span> : null}
        </span>
      ),
    },
  },
  {
    id: "where",
    label: "Where",
    column: {
      id: "where",
      header: "Where",
      filter: "text",
      width: 320,
      cell: (row) =>
        !row.location ? (
          <Muted>No code location</Muted>
        ) : row.codeUrl ? (
          <a
            href={row.codeUrl}
            target="_blank"
            rel="noreferrer"
            title={`${row.location} — open on GitHub`}
            className="block truncate font-mono text-xs text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.location}
          </a>
        ) : (
          <TextCell value={row.location} className="font-mono text-xs" />
        ),
    },
  },
  {
    id: "fix",
    label: "Fix",
    column: {
      id: "fix",
      header: "Fix",
      filter: "text",
      width: 280,
      cell: (row) =>
        row.fixHref ? (
          <Link
            href={row.fixHref}
            className="block truncate text-primary hover:underline"
            title={row.fixHref === UNCONVERTED_PATH ? row.fix : `${row.fix} — open the mandate`}
            onClick={(event) => event.stopPropagation()}
          >
            {row.fix}
          </Link>
        ) : (
          <TextCell value={row.fix} />
        ),
    },
  },
  {
    id: "kind",
    label: "Type",
    facet: "kind",
    formatFacetValue: (v) => KIND_LABEL[v as HealthFinding["kind"]] ?? v,
    column: {
      id: "kind",
      header: "Type",
      filter: "select",
      width: 170,
      cell: (row) => <TextCell value={KIND_LABEL[row.kind]} muted />,
    },
  },
  {
    id: "source",
    label: "Found by",
    facet: "source",
    defaultHidden: true,
    formatFacetValue: (v) => SOURCE_LABEL[v as HealthFinding["source"]] ?? v,
    column: {
      id: "source",
      header: "Found by",
      filter: "select",
      width: 140,
      cell: (row) => <TextCell value={SOURCE_LABEL[row.source]} muted />,
    },
  },
  {
    id: "repo",
    label: "Repo",
    facet: "repo",
    defaultHidden: true,
    formatFacetValue: (v) => (v === "__none__" ? "No code location" : v),
    column: { id: "repo", header: "Repo", filter: "select", width: 130, cell: (row) => <TextCell value={row.repo} /> },
  },
];

function useRowActions(): EntityRowActionsResult<HealthFinding> {
  const router = useRouter();
  const menuFor = (row: HealthFinding) => (): ItemMenuConfig => {
    const open: ItemMenuEntry[] = [];
    if (row.fixHref) open.push({ id: "open-fix", label: row.fixHref === UNCONVERTED_PATH ? "Open unconverted AI calls" : "Open mandate", icon: ExternalLink, kind: "link", href: row.fixHref });
    if (row.codeUrl) {
      open.push({ id: "open-code", label: "Open code on GitHub", icon: ExternalLink, kind: "link", href: row.codeUrl, target: "_blank" });
    }
    const copies: ItemMenuEntry[] = [];
    if (row.location) copies.push({ id: "copy-location", label: "Copy location", icon: Copy, onSelect: () => copy(row.location, "location") });
    if (row.mandateKey) copies.push({ id: "copy-key", label: "Copy mandate key", icon: Copy, onSelect: () => copy(row.mandateKey, "key") });
    return { sections: [{ id: "open", items: open }, { id: "copy", items: copies }] };
  };
  return {
    actions: {
      menuFor,
      onOpenRow: (row) => {
        if (row.fixHref) router.push(row.fixHref);
        else if (row.codeUrl) window.open(row.codeUrl, "_blank", "noopener,noreferrer");
      },
    },
  };
}

function buildConfig(dispatch: AppDispatch, onLoad: (load: HealthLoad) => void): EntityListConfig<HealthFinding> {
  return {
    surfaceKey: "admin-mandates-health-preview",
    entityLabel: { singular: "finding", plural: "findings" },
    sourceFeature: "agents-other",
    scopes: ["system"],
    service: createMemoryListService<HealthFinding>({
      load: async () => {
        const load = await fetchMandateHealth(dispatch);
        onLoad(load);
        if (load.findings.length === 0 && load.failures.length > 0) {
          // Plain words on screen; the raw messages stay in the console.
          console.error("[mandate-health] every source failed", load.failures);
          throw new Error(
            load.failures
              .map((f) => `${SOURCE_LABEL[f.source]} ${plainFailureReason(f.message)}.`)
              .join(" "),
          );
        }
        return load.findings;
      },
      scope: "system",
      defaultSort: "severity",
      fields: {
        severity: { value: (r) => r.severity, sortValue: (r) => SEVERITY_RANK[r.severity], facet: true },
        mandate: { value: (r) => r.mandateName || noMandateWord(r), search: true, facet: true },
        problem: { value: (r) => `${r.problem} ${r.detail}`, search: true },
        where: { value: (r) => r.location, search: true },
        fix: { value: (r) => r.fix },
        kind: { value: (r) => r.kind, facet: true },
        source: { value: (r) => r.source, facet: true },
        repo: { value: (r) => r.repo, facet: true },
        key: { value: (r) => r.mandateKey, search: true },
      },
    }),
    columns: COLUMNS,
    prefsVersion: 1,
    prefsDefaults: { sort: "severity", direction: "desc", pageSize: 50 },
    getRowId: (row) => row.id,
    getRowName: (row) => `${row.mandateName || noMandateWord(row)}: ${row.problem}`,
    urlState: true,
    supportsArchived: false,
    tableToolbar: { tableId: "admin-mandates-health-preview" },
    searchPlaceholder: "Search mandates, problems, files…",
    useRowActions,
    facetSections: [],
    copy: {
      label: "Mandate health finding",
      listLabel: "Mandate health",
      location: ADMIN_MANDATES_HEALTH,
      rowKind: "mandate-health-finding",
      listKind: "mandate-health-list",
      humanRow: (row) =>
        `[${SEVERITY_LABEL[row.severity]}] ${row.mandateName || noMandateWord(row)} — ${row.problem}${row.detail ? ` (${row.detail})` : ""}; ${row.location || "no code location"}; fix: ${row.fix}`,
      showRow: false,
      showToolbar: false,
    },
    emptyState: {
      title: "No open findings",
      description: "The code scan and the code-vs-database check found nothing wrong.",
    },
  };
}

export function MandateHealthPage() {
  const dispatch = useAppDispatch();
  const [failures, setFailures] = useState<HealthLoad["failures"]>([]);
  const [attempt, setAttempt] = useState(0);
  const [config, setConfig] = useState(() => buildConfig(dispatch, (load) => setFailures(load.failures)));
  // Try again = a fresh reader: the memory service holds its first answer.
  const retry = () => {
    setFailures([]);
    setConfig(buildConfig(dispatch, (load) => setFailures(load.failures)));
    setAttempt((n) => n + 1);
  };
  return (
    <EntityListPage
      key={attempt}
      config={config}
      defaultScope={{ kind: "system" }}
      clearsShellHeader={false}
      notice={
        <EntitySourceFailures
          operation="Load mandate health"
          failures={failures.map((f) => ({ label: SOURCE_LABEL[f.source], error: f.message }))}
          onRetry={retry}
          consequence="The findings below come only from the sources that answered."
        />
      }
      headerActions={
        <Link
          href={UNCONVERTED_PATH}
          className="whitespace-nowrap rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Unconverted AI calls
        </Link>
      }
    />
  );
}
