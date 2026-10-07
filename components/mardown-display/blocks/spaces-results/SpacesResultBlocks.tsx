"use client";

// The ONE component per Spaces agent answer kind (`features/content-ir/kinds/spaces-results.ts`):
// what the run window shows for the Space Builder, the Database Designer and the Notion move-in.
// Spaces itself acts on the same value (opens the Space, creates the table, builds the page);
// these components only say what the answer holds, with a door to everything it names.

import Link from "next/link";
import { Badge } from "@ai-matrx/design-system/controls";
import { Database, FileText, LayoutGrid, Table2 } from "lucide-react";

import type {
  SpaceBuildResultData,
  SpaceDatabaseDesignData,
  SpaceNotionImportData,
  SpacesDatabaseSummary,
} from "@/features/content-ir/kinds/spaces-results";

const FRAME = "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground";

function asData<T>(serverData: unknown): T | null {
  return typeof serverData === "object" && serverData !== null ? (serverData as T) : null;
}

function PropertyList({ db }: { db: SpacesDatabaseSummary }) {
  if (db.properties.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {db.properties.map((p) => (
        <Badge key={p.key} tone={p.key === db.titleProperty ? "primary" : "neutral"}>
          {p.name}
          <span className="text-muted-foreground">{p.type.replace("_", " ")}</span>
        </Badge>
      ))}
    </div>
  );
}

function SampleRows({ db, limit = 5 }: { db: SpacesDatabaseSummary; limit?: number }) {
  if (db.rows.length === 0 || db.properties.length === 0) return null;
  const columns = db.properties.slice(0, 4);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-2 py-1 text-left font-medium">{c.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {db.rows.slice(0, limit).map((row, i) => (
            <tr key={i} className="border-t border-border">
              {columns.map((c) => (
                <td key={c.key} className="max-w-48 truncate px-2 py-1">{row[c.key] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SpaceBuildResultBlock({ serverData }: { serverData?: unknown }) {
  const data = asData<SpaceBuildResultData>(serverData);
  if (!data) return null;
  const others = data.spaceIds.filter((id) => id !== data.rootSpaceId);
  return (
    <section className={FRAME} data-kind="space_build_result">
      <div className="flex items-start gap-2">
        <LayoutGrid className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-sm">{data.summary || "Your Space is ready."}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {data.rootSpaceId ? (
          <Link href={`/spaces/${data.rootSpaceId}`} className="text-sm font-medium text-primary hover:underline">
            Open the Space
          </Link>
        ) : null}
        {others.length > 0 ? (
          <Badge tone="neutral">
            <FileText className="h-3 w-3" /> {others.length} {others.length === 1 ? "sub-page" : "sub-pages"}
          </Badge>
        ) : null}
        {data.tableIds.map((id, i) => (
          <Link key={id} href={`/data/${id}`}>
            <Badge tone="neutral">
              <Table2 className="h-3 w-3" /> Table {i + 1}
            </Badge>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function SpaceDatabaseDesignBlock({ serverData }: { serverData?: unknown }) {
  const data = asData<SpaceDatabaseDesignData>(serverData);
  if (!data) return null;
  return (
    <section className={FRAME} data-kind="space_database_design">
      <div className="flex items-start gap-2">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{data.name || "Database"}</h3>
          {data.summary ? <p className="text-sm text-muted-foreground">{data.summary}</p> : null}
        </div>
      </div>
      <PropertyList db={data} />
      {data.views.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {data.views.map((v, i) => (
            <Badge key={`${v.name}:${i}`} tone="info">
              {v.name || v.layout}
              <span className="text-muted-foreground">{v.layout}</span>
            </Badge>
          ))}
        </div>
      ) : null}
      <SampleRows db={data} />
    </section>
  );
}

export function SpaceNotionImportBlock({ serverData }: { serverData?: unknown }) {
  const data = asData<SpaceNotionImportData>(serverData);
  if (!data) return null;
  const preview = data.markdown.split("\n").filter((l) => l.trim()).slice(0, 6);
  return (
    <section className={FRAME} data-kind="space_notion_import">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{data.title || "Imported page"}</h3>
          {preview.length > 0 ? (
            <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{preview.join("\n")}</p>
          ) : null}
        </div>
      </div>
      {data.databases.map((db, i) => (
        <div key={`${db.name}:${i}`} className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Database className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{db.name || `Database ${i + 1}`}</span>
            <span className="text-xs text-muted-foreground">
              {db.rows.length} {db.rows.length === 1 ? "row" : "rows"}
            </span>
          </div>
          <PropertyList db={db} />
          <SampleRows db={db} limit={3} />
        </div>
      ))}
      {data.notes.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Not carried over</span>
          <ul className="list-disc pl-5 text-sm">
            {data.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
