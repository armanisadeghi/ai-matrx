"use client";

/**
 * Kind Registry admin — /administration/kind-registry (super-admin gated by
 * the (admin) layout; no extra gate here).
 *
 * Browse/search every kind the platform knows (compiled system kinds +
 * flexible_data Block Schemas rows, merged by `listAllKinds`), inspect
 * fields + facets + the uses / used-by reference graph, and EXPORT a
 * provider-ready JSON Schema for any kind — referenced kinds resolve into
 * `$defs` automatically via `kindSchemaToJsonSchema`.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Copy,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { kindSchemaToJsonSchema } from "@/features/content-ir/convert/kind-to-json-schema";
import {
  catalogResolver,
  listAllKinds,
  listCompiledKinds,
  type KindCatalogEntry,
  type KindCatalogSource,
} from "@/features/content-ir/registry/kind-catalog";
import type { FieldSchema } from "@/features/content-ir/core/kind-schema.types";

const SOURCE_STYLES: Record<KindCatalogSource, string> = {
  system: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  flexible_data:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  both: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
};

const SOURCE_LABELS: Record<KindCatalogSource, string> = {
  system: "system",
  flexible_data: "db",
  both: "both",
};

/** One row per field, inline_object children flattened with dotted names. */
type FieldRow = { name: string; depth: number; field: FieldSchema };

function flattenFields(
  fields: Record<string, FieldSchema>,
  prefix = "",
  depth = 0,
): FieldRow[] {
  const rows: FieldRow[] = [];
  for (const [name, field] of Object.entries(fields)) {
    rows.push({ name: `${prefix}${name}`, depth, field });
    if (field.type === "inline_object") {
      rows.push(...flattenFields(field.fields, `${prefix}${name}.`, depth + 1));
    }
  }
  return rows;
}

function fieldTypeSummary(field: FieldSchema): string {
  switch (field.type) {
    case "enum":
      return `enum(${field.values.join(" | ")})`;
    case "union":
      return `union(${field.scalars.join(" | ")})`;
    case "record":
      return `record<string, ${field.values}>`;
    case "inline_object":
      return `inline_object (${Object.keys(field.fields).length} fields)`;
    case "object":
      return "object →";
    case "array":
      return "array of →";
    default:
      return field.type;
  }
}

function fieldKindRefs(field: FieldSchema): string[] {
  if (field.type === "object") return [field.kind];
  if (field.type === "array") return field.itemKinds;
  return [];
}

export default function KindRegistryAdminClient() {
  const [catalog, setCatalog] = useState<KindCatalogEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const [strict, setStrict] = useState(false);
  const [injectKind, setInjectKind] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await listAllKinds();
        if (cancelled) return;
        setCatalog(entries);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        // Loud, then degrade to the compiled registry so the page stays usable.
        setLoadError(message);
        setCatalog(listCompiledKinds());
        toast.error(
          `flexible_data Block Schemas unavailable — showing compiled kinds only. ${message}`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  function reload() {
    setCatalog(null);
    setLoadError(null);
    setReloadTick((tick) => tick + 1);
  }

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (entry) =>
        entry.kind.toLowerCase().includes(q) ||
        entry.label.toLowerCase().includes(q) ||
        (entry.flexibleDataId ?? "").toLowerCase().includes(q),
    );
  }, [catalog, query]);

  const selected = useMemo(
    () => catalog?.find((entry) => entry.kind === selectedKind) ?? null,
    [catalog, selectedKind],
  );

  const resolver = useMemo(
    () => (catalog ? catalogResolver(catalog) : null),
    [catalog],
  );

  const exported = useMemo(() => {
    if (!resolver || !selected) return null;
    return kindSchemaToJsonSchema(selected.kind, resolver, {
      strict,
      injectKind,
    });
  }, [resolver, selected, strict, injectKind]);

  const exportPayload = useMemo(
    () =>
      exported
        ? {
            name: exported.name,
            strict: exported.strict,
            schema: exported.schema,
          }
        : null,
    [exported],
  );

  const stats = useMemo(() => {
    const entries = catalog ?? [];
    return {
      total: entries.length,
      system: entries.filter((e) => e.source === "system").length,
      db: entries.filter((e) => e.source === "flexible_data").length,
      both: entries.filter((e) => e.source === "both").length,
    };
  }, [catalog]);

  async function copyExport() {
    if (!exportPayload || !selected) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(exportPayload, null, 2),
      );
      toast.success(`Copied ${selected.kind} JSON Schema`);
    } catch (error) {
      toast.error(
        `Clipboard copy failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return (
    <div className="flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden bg-textured">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5 pr-14">
        <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Boxes className="h-4 w-4 text-sky-500" />
          Kind Registry
        </h1>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="secondary">{stats.total} kinds</Badge>
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SOURCE_STYLES.system}`}>
            {stats.system} system
          </span>
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SOURCE_STYLES.flexible_data}`}>
            {stats.db} db
          </span>
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SOURCE_STYLES.both}`}>
            {stats.both} both
          </span>
        </div>
        <div className="relative ml-auto w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search slug, label, or row id"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => setReloadTick((tick) => tick + 1)}
          title="Reload the catalog"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </header>

      {loadError && (
        <div className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          flexible_data Block Schemas unavailable — showing compiled system
          kinds only. {loadError}
        </div>
      )}

      {catalog === null ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading kind catalog</span>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Left: searchable kind list */}
          <aside className="w-80 shrink-0 overflow-y-auto border-r border-border bg-card/50">
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                No kinds match &quot;{query}&quot;.
              </p>
            ) : (
              <ul>
                {filtered.map((entry) => (
                  <li key={entry.kind}>
                    <button
                      type="button"
                      onClick={() => setSelectedKind(entry.kind)}
                      className={`w-full border-b border-border/60 px-3 py-2 text-left transition-colors hover:bg-accent/50 ${
                        entry.kind === selectedKind ? "bg-accent" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {entry.label}
                        </span>
                        <span
                          className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_STYLES[entry.source]}`}
                        >
                          {SOURCE_LABELS[entry.source]}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <code className="truncate font-mono text-[11px] text-muted-foreground">
                          {entry.kind}
                        </code>
                        {entry.tier && (
                          <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">
                            {entry.tier}
                          </span>
                        )}
                        {entry.facets.legacyBlockType && (
                          <span
                            className="shrink-0 rounded bg-amber-100 px-1 py-px text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                            title={`Legacy bridge → ${entry.facets.legacyBlockType}`}
                          >
                            bridge
                          </span>
                        )}
                        {entry.facets.artifactCanvasType && (
                          <span
                            className="shrink-0 rounded bg-teal-100 px-1 py-px text-[10px] text-teal-800 dark:bg-teal-900/40 dark:text-teal-200"
                            title={`Artifact canvas → ${entry.facets.artifactCanvasType}`}
                          >
                            artifact
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* Right: detail + export */}
          <main className="min-w-0 flex-1 space-y-4 overflow-y-auto p-4">
            {!selected ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Select a kind to inspect it.
              </p>
            ) : (
              <>
                <section className="rounded-lg border border-border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">
                      {selected.label}
                    </h2>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                      {selected.kind}
                    </code>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SOURCE_STYLES[selected.source]}`}
                    >
                      {SOURCE_LABELS[selected.source]}
                    </span>
                    {selected.tier && (
                      <Badge variant="outline">{selected.tier}</Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <FacetItem
                      label="legacy bridge"
                      value={selected.facets.legacyBlockType}
                    />
                    <FacetItem
                      label="artifact canvas"
                      value={selected.facets.artifactCanvasType}
                    />
                    <FacetItem
                      label="toMarkdown"
                      value={selected.facets.hasToMarkdown ? "yes" : null}
                    />
                    <FacetItem
                      label="toLegacyServerData"
                      value={selected.facets.hasToLegacyServerData ? "yes" : null}
                    />
                    <FacetItem
                      label="component"
                      value={selected.facets.hasComponent ? "yes" : null}
                    />
                    <FacetItem
                      label="persist structured"
                      value={selected.facets.persistStructured ? "yes" : null}
                    />
                    {selected.flexibleDataId && (
                      <FacetItem label="row id" value={selected.flexibleDataId} />
                    )}
                  </div>
                </section>

                {/* Fields */}
                <section className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
                    Fields
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-1.5 font-medium">Field</th>
                          <th className="px-3 py-1.5 font-medium">Type</th>
                          <th className="px-3 py-1.5 font-medium">Required</th>
                          <th className="px-3 py-1.5 font-medium">Nullable</th>
                          <th className="px-3 py-1.5 font-medium">Kind refs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flattenFields(selected.fields).map((row) => (
                          <tr
                            key={row.name}
                            className="border-b border-border/60 last:border-0 hover:bg-accent/30"
                          >
                            <td
                              className="px-3 py-1.5 font-mono text-xs text-foreground"
                              style={{ paddingLeft: `${12 + row.depth * 16}px` }}
                            >
                              {row.name}
                            </td>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground">
                              {fieldTypeSummary(row.field)}
                            </td>
                            <td className="px-3 py-1.5 text-xs">
                              {row.field.required ? (
                                <span className="font-medium text-foreground">
                                  yes
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-xs">
                              {row.field.nullable ? (
                                <span className="font-medium text-foreground">
                                  yes
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex flex-wrap gap-1">
                                {fieldKindRefs(row.field).map((ref) => (
                                  <KindChip
                                    key={ref}
                                    kind={ref}
                                    known={
                                      catalog?.some((e) => e.kind === ref) ??
                                      false
                                    }
                                    onNavigate={setSelectedKind}
                                  />
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {Object.keys(selected.fields).length === 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-3 py-3 text-center text-xs text-muted-foreground"
                            >
                              No fields — the registry has no schema for this
                              kind yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* References */}
                <section className="rounded-lg border border-border bg-card p-3">
                  <div className="text-sm font-semibold text-foreground">
                    References
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <ArrowUpRight className="h-3 w-3" /> Uses
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {selected.referencedKinds.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            none
                          </span>
                        ) : (
                          selected.referencedKinds.map((ref) => (
                            <KindChip
                              key={ref}
                              kind={ref}
                              known={
                                catalog?.some((e) => e.kind === ref) ?? false
                              }
                              onNavigate={setSelectedKind}
                            />
                          ))
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <ArrowDownLeft className="h-3 w-3" /> Used by
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {selected.referencedBy.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            none
                          </span>
                        ) : (
                          selected.referencedBy.map((ref) => (
                            <KindChip
                              key={ref}
                              kind={ref}
                              known
                              onNavigate={setSelectedKind}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Export */}
                <section className="rounded-lg border border-border bg-card">
                  <div className="flex flex-wrap items-center gap-4 border-b border-border px-3 py-2">
                    <div className="text-sm font-semibold text-foreground">
                      JSON Schema export
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Switch
                        checked={strict}
                        onCheckedChange={setStrict}
                        aria-label="Strict mode"
                      />
                      strict
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Switch
                        checked={injectKind}
                        onCheckedChange={setInjectKind}
                        aria-label="Include __kind discriminators"
                      />
                      include __kind discriminators
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="ml-auto h-7"
                      onClick={copyExport}
                      disabled={!exportPayload}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                    </Button>
                  </div>

                  {exported && exported.unresolved.length > 0 && (
                    <div className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                      Unresolved referenced kinds (stubbed):{" "}
                      {exported.unresolved.join(", ")}
                    </div>
                  )}

                  {exportPayload ? (
                    <div className="flex h-[420px] flex-col overflow-hidden p-2">
                      <JsonInspector
                        data={exportPayload}
                        label={`${selected.kind} schema`}
                        defaultView="json"
                        editorReadOnly
                        className="min-h-0 flex-1"
                      />
                    </div>
                  ) : (
                    <p className="px-3 py-4 text-xs text-muted-foreground">
                      No schema available to export for this kind.
                    </p>
                  )}
                </section>
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

function FacetItem({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}:</span>
      {value ? (
        <code className="rounded bg-muted px-1 py-px font-mono text-[11px] text-foreground">
          {value}
        </code>
      ) : (
        <span>—</span>
      )}
    </span>
  );
}

function KindChip({
  kind,
  known,
  onNavigate,
}: {
  kind: string;
  known: boolean;
  onNavigate: (kind: string) => void;
}) {
  if (!known) {
    return (
      <code
        className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[11px] text-destructive"
        title="Not in the catalog — unresolved reference"
      >
        {kind}
      </code>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onNavigate(kind)}
      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      title={`Open ${kind}`}
    >
      {kind}
    </button>
  );
}
