"use client";

// features/mandates/code-location/CodeLocationCell.tsx
//
// THE "Code" column of the admin mandate list — repo · file:lines, the full
// path on hover, and the file at those lines on GitHub. SUPER ADMINS ONLY:
// the page adds this column only when `selectIsSuperAdmin` is true, and the
// read behind it (`mandate.code_locations`) refuses everyone else.

import { useEffect, useSyncExternalStore } from "react";
import { ExternalLink } from "lucide-react";
import type { EntityColumnSpec } from "@/lib/entity-list/columns";
import {
  codeLocationsSnapshot,
  ensureMandateCodeLocations,
  githubRangeUrl,
  lineRangeText,
  subscribeCodeLocations,
} from "./codeLocation";

function useCodeLocations() {
  const state = useSyncExternalStore(
    subscribeCodeLocations,
    codeLocationsSnapshot,
    codeLocationsSnapshot,
  );
  useEffect(() => ensureMandateCodeLocations(), []);
  return state;
}

export function CodeLocationCell({ mandateKey }: { mandateKey: string }) {
  const state = useCodeLocations();
  if (state.status === "failed") {
    return (
      <span className="type-secondary text-amber-700 dark:text-amber-300" title={state.error}>
        Unavailable
      </span>
    );
  }
  if (state.status !== "ready") {
    return <span className="type-secondary text-muted-foreground">Checking…</span>;
  }
  const entry = state.byKey.get(mandateKey);
  if (!entry || entry.origin !== "code") {
    return <span className="type-secondary text-muted-foreground">Created in app</span>;
  }
  const location = entry.location;
  if (!location) {
    return (
      <span
        className="type-secondary text-amber-700 dark:text-amber-300"
        title="No scan has found where code declares this mandate"
      >
        Not found
      </span>
    );
  }
  const file = location.filePath.split("/").pop() ?? location.filePath;
  const full = `${location.repo}:${location.filePath}:${lineRangeText(location)}`;
  const href = githubRangeUrl(entry.githubFullName, location);
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={full}>
      <span className="min-w-0 truncate font-mono type-meta">
        <span className="text-muted-foreground">{location.repo} · </span>
        {file}:{lineRangeText(location)}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${full} on GitHub`}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={(event) => event.stopPropagation()}
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      ) : null}
    </span>
  );
}

/** The column spec, inserted by the page for super admins only. */
export function codeLocationColumn<TRow extends { mandateKey: string }>(): EntityColumnSpec<TRow> {
  return {
    id: "codeLocation",
    label: "Code",
    column: {
      id: "codeLocation",
      header: "Code",
      filter: false,
      sortable: false,
      width: 260,
      cell: (row: TRow) => <CodeLocationCell mandateKey={row.mandateKey} />,
    },
  };
}

/** `columns` with the Code column right after `afterId` (or at the end). */
export function withCodeLocationColumn<TRow extends { mandateKey: string }>(
  columns: EntityColumnSpec<TRow>[],
  afterId = "mandateKey",
): EntityColumnSpec<TRow>[] {
  const at = columns.findIndex((spec) => spec.id === afterId);
  const column = codeLocationColumn<TRow>();
  return at < 0
    ? [...columns, column]
    : [...columns.slice(0, at + 1), column, ...columns.slice(at + 1)];
}
