"use client";

/**
 * The Applet record's parts, edited as the record (CONTRACTS §8):
 *   pages    [{ path, title, file }]
 *   mandates [{ alias, key }]          — jobs, picked from the Applet catalogue's job list
 *   sources  [{ alias, table_id, organization_id } | { alias, entity }] — from the catalogue
 *
 * Each editor keeps a local draft and saves the whole column through
 * `saveAppletRecord` (version-guarded; the snapshot trigger records a version).
 *
 * The job and source options come from `readAppletCatalogue`
 * (`@ai-matrx/applets/catalogue`) — the one list of what an Applet may run and
 * read, the same list the builder sees. There is no separate mandate picker in
 * the platform that picks a JOB (MandateAgentPicker picks an agent FOR a job),
 * so the catalogue's jobs feed the canonical `Select`.
 */

import { useEffect, useState } from "react";
import { ProInput } from "@/components/official/ProInput";
import { Plus, Trash2 } from "lucide-react";
import {
  Button,
  EmptyState,
  Field,
  RegionSkeleton,
  RowGroup,
  Select,
  type SelectOption,
} from "@ai-matrx/design-system/controls";
import { readAppletCatalogue, type AppletCatalogue } from "@ai-matrx/applets/catalogue";
import { supabase } from "@/utils/supabase/client";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast-service";
import { saveAppletRecord } from "@/features/agents/redux/applets/thunks";
import {
  appletFiles,
  appletJobs,
  appletPages,
  appletSources,
  type AppletDefinition,
  type AppletJob,
  type AppletPage,
  type AppletSource,
} from "@/features/applets/types";
import type { Json } from "@/types/database.types";

// ── shared ───────────────────────────────────────────────────────────────────

function useSaveRecordPart(appId: string) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const save = async (patch: Parameters<typeof saveAppletRecord>[0]["patch"]) => {
    setBusy(true);
    try {
      await dispatch(saveAppletRecord({ appId, patch })).unwrap();
      toast.success("Saved.");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, save };
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function SaveBar({
  dirty,
  busy,
  onSave,
  onReset,
}: {
  dirty: boolean;
  busy: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  if (!dirty) return null;
  return (
    <div className="flex justify-end gap-2">
      <Button variant="quiet" onClick={onReset} disabled={busy}>
        Discard
      </Button>
      <Button variant="primary" onClick={onSave} disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

/** The catalogue of what this Applet's organization can run and read. */
function useAppletCatalogue(organizationId: string | null) {
  const [catalogue, setCatalogue] = useState<AppletCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!organizationId) return;
    let live = true;
    readAppletCatalogue(supabase, { organizationId, maxJobs: 200, sampleRows: 0, maxTables: 200 })
      .then((c) => live && setCatalogue(c))
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, [organizationId]);
  return { catalogue, error };
}

function CatalogueGaps({ catalogue, error }: { catalogue: AppletCatalogue | null; error: string | null }) {
  const gaps = error ? [error] : (catalogue?.gaps ?? []);
  if (gaps.length === 0) return null;
  return (
    <p className="text-xs text-destructive" role="alert">
      Some options could not be read: {gaps.join("; ")}
    </p>
  );
}

// ── Pages ────────────────────────────────────────────────────────────────────

export function AppletPagesEditor({ app }: { app: AppletDefinition }) {
  const saved = appletPages(app);
  const [pages, setPages] = useState<AppletPage[]>(saved);
  const { busy, save } = useSaveRecordPart(app.id);
  useEffect(() => setPages(appletPages(app)), [app.id, app.version]);

  const fileOptions: SelectOption[] = Object.keys(appletFiles(app))
    .sort()
    .map((name) => ({ value: name, label: name }));
  const set = (i: number, next: Partial<AppletPage>) =>
    setPages((prev) => prev.map((p, j) => (j === i ? { ...p, ...next } : p)));

  return (
    <div className="space-y-3">
      {pages.length === 0 ? (
        <EmptyState icon={<Plus />} title="No pages" line="The entry file renders on its own." />
      ) : (
        <RowGroup title="Pages">
          {pages.map((page, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 px-3 py-2">
              {/* ui-exception: a route path is a raw value, not prose */}
              <Field
                aria-label="Path"
                value={page.path}
                placeholder="/clients/:id"
                onChange={(e) => set(i, { path: e.target.value })}
                className="w-40"
              />
              <ProInput
                aria-label="Title"
                value={page.title}
                placeholder="Title"
                onChange={(e) => set(i, { title: e.target.value })}
                wrapperClassName="min-w-32 flex-1"
              />
              <Select
                aria-label="File"
                value={page.file}
                options={
                  fileOptions.some((o) => o.value === page.file) || !page.file
                    ? fileOptions
                    : [...fileOptions, { value: page.file, label: `${page.file} (missing)` }]
                }
                onValueChange={(file) => set(i, { file })}
                className="w-44"
              />
              <Button
                variant="quiet"
                icon={<Trash2 />}
                aria-label={`Remove page ${page.path}`}
                onClick={() => setPages((prev) => prev.filter((_, j) => j !== i))}
              />
            </div>
          ))}
        </RowGroup>
      )}
      <div className="flex justify-between gap-2">
        <Button
          variant="outline"
          icon={<Plus />}
          disabled={fileOptions.length === 0}
          onClick={() =>
            setPages((prev) => [...prev, { path: "/new", title: "New page", file: fileOptions[0]?.value ?? "" }])
          }
        >
          Add page
        </Button>
        <SaveBar
          dirty={!same(pages, saved)}
          busy={busy}
          onReset={() => setPages(saved)}
          onSave={() => {
            const paths = pages.map((p) => p.path.trim());
            if (paths.some((p) => !p.startsWith("/"))) {
              toast.error("Every path starts with /.");
              return;
            }
            if (new Set(paths).size !== paths.length) {
              toast.error("Two pages share a path.");
              return;
            }
            void save({
              pages: pages.map((p): Json =>
                p.parent
                  ? { path: p.path.trim(), title: p.title, file: p.file, parent: p.parent }
                  : { path: p.path.trim(), title: p.title, file: p.file },
              ),
            });
          }}
        />
      </div>
    </div>
  );
}

// ── Jobs ─────────────────────────────────────────────────────────────────────

export function AppletJobsEditor({ app }: { app: AppletDefinition }) {
  const saved = appletJobs(app);
  const [jobs, setJobs] = useState<AppletJob[]>(saved);
  const { busy, save } = useSaveRecordPart(app.id);
  const { catalogue, error } = useAppletCatalogue(app.organization_id);
  useEffect(() => setJobs(appletJobs(app)), [app.id, app.version]);

  const jobOptions: SelectOption[] = (catalogue?.jobs ?? []).map((j) => ({
    value: j.key,
    label: j.label || j.key,
    meta: j.own ? "Yours" : undefined,
  }));
  const optionsFor = (key: string): SelectOption[] =>
    !key || jobOptions.some((o) => o.value === key) ? jobOptions : [{ value: key, label: key }, ...jobOptions];
  const set = (i: number, next: Partial<AppletJob>) =>
    setJobs((prev) => prev.map((j, k) => (k === i ? { ...j, ...next } : j)));

  return (
    <div className="space-y-3">
      <CatalogueGaps catalogue={catalogue} error={error} />
      {jobs.length === 0 ? (
        <EmptyState icon={<Plus />} title="No jobs" line="Add a job for the Applet to run with useJob." />
      ) : (
        <RowGroup title="Jobs">
          {jobs.map((job, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <Field
                aria-label="Alias"
                value={job.alias}
                placeholder="alias"
                onChange={(e) => set(i, { alias: e.target.value })}
                className="w-40 font-mono"
              />
              {catalogue ? (
                <Select
                  aria-label="Job"
                  value={job.key}
                  options={optionsFor(job.key)}
                  onValueChange={(key) => set(i, { key })}
                  className="min-w-48 flex-1"
                />
              ) : (
                <RegionSkeleton shape="rows" count={1} />
              )}
              <Button
                variant="quiet"
                icon={<Trash2 />}
                aria-label={`Remove job ${job.alias}`}
                onClick={() => setJobs((prev) => prev.filter((_, k) => k !== i))}
              />
            </div>
          ))}
        </RowGroup>
      )}
      <div className="flex justify-between gap-2">
        <Button
          variant="outline"
          icon={<Plus />}
          disabled={!catalogue || jobOptions.length === 0}
          onClick={() => setJobs((prev) => [...prev, { alias: `job${prev.length + 1}`, key: jobOptions[0]?.value ?? "" }])}
        >
          Add job
        </Button>
        <SaveBar
          dirty={!same(jobs, saved)}
          busy={busy}
          onReset={() => setJobs(saved)}
          onSave={() => {
            const aliases = jobs.map((j) => j.alias.trim());
            if (aliases.some((a) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(a))) {
              toast.error("An alias is letters, digits and _ only.");
              return;
            }
            if (new Set(aliases).size !== aliases.length) {
              toast.error("Two jobs share an alias.");
              return;
            }
            void save({ mandates: jobs.map((j) => ({ alias: j.alias.trim(), key: j.key })) });
          }}
        />
      </div>
    </div>
  );
}

// ── Sources ──────────────────────────────────────────────────────────────────

function sourceValue(source: AppletSource): string {
  if ("new_table" in source) return `new:${source.alias}`;
  return "entity" in source ? `entity:${source.entity}` : `table:${source.organization_id}:${source.table_id}`;
}

function sourceFromValue(alias: string, value: string): AppletSource | null {
  const [kind, a, b] = value.split(":");
  if (kind === "entity" && a) return { alias, entity: a };
  if (kind === "table" && a && b) return { alias, organization_id: a, table_id: b };
  return null;
}

export function AppletSourcesEditor({ app }: { app: AppletDefinition }) {
  const saved = appletSources(app);
  const [sources, setSources] = useState<AppletSource[]>(saved);
  const { busy, save } = useSaveRecordPart(app.id);
  const { catalogue, error } = useAppletCatalogue(app.organization_id);
  useEffect(() => setSources(appletSources(app)), [app.id, app.version]);

  const options: SelectOption[] = [
    ...(catalogue?.tables ?? []).map((t) => ({
      value: `table:${t.organization_id}:${t.table_id}`,
      label: t.name,
      meta: t.organization_name ?? undefined,
    })),
    ...(catalogue?.entities ?? []).map((e) => ({ value: `entity:${e.token}`, label: e.label, meta: "Platform" })),
  ];
  // A table the draft will make keeps its own option, so its row reads as that table, not an id.
  const optionsFor = (source: AppletSource): SelectOption[] => {
    const value = sourceValue(source);
    if (options.some((o) => o.value === value)) return options;
    const own = "new_table" in source ? { value, label: source.new_table.name, meta: "New table" } : { value, label: value.split(":").pop() ?? value };
    return [own, ...options];
  };
  const setAlias = (i: number, alias: string) =>
    setSources((prev) => prev.map((s, k) => (k === i ? { ...s, alias } : s)));
  const setTarget = (i: number, value: string) =>
    setSources((prev) =>
      prev.map((s, k) => (k === i ? (sourceFromValue(s.alias, value) ?? s) : s)),
    );

  return (
    <div className="space-y-3">
      <CatalogueGaps catalogue={catalogue} error={error} />
      {sources.length === 0 ? (
        <EmptyState icon={<Plus />} title="No sources" line="Add a table or record type for useRows." />
      ) : (
        <RowGroup title="Sources">
          {sources.map((source, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <Field
                aria-label="Alias"
                value={source.alias}
                placeholder="alias"
                onChange={(e) => setAlias(i, e.target.value)}
                className="w-40 font-mono"
              />
              {catalogue ? (
                <Select
                  aria-label="Table or record type"
                  value={sourceValue(source)}
                  options={optionsFor(source)}
                  onValueChange={(value) => setTarget(i, value)}
                  className="min-w-48 flex-1"
                />
              ) : (
                <RegionSkeleton shape="rows" count={1} />
              )}
              <Button
                variant="quiet"
                icon={<Trash2 />}
                aria-label={`Remove source ${source.alias}`}
                onClick={() => setSources((prev) => prev.filter((_, k) => k !== i))}
              />
            </div>
          ))}
        </RowGroup>
      )}
      <div className="flex justify-between gap-2">
        <Button
          variant="outline"
          icon={<Plus />}
          disabled={!catalogue || options.length === 0}
          onClick={() => {
            const first = catalogue?.tables[0];
            const next = first
              ? { alias: first.suggested_alias, organization_id: first.organization_id, table_id: first.table_id }
              : sourceFromValue(`source${sources.length + 1}`, options[0]?.value ?? "");
            if (next) setSources((prev) => [...prev, next]);
          }}
        >
          Add source
        </Button>
        <SaveBar
          dirty={!same(sources, saved)}
          busy={busy}
          onReset={() => setSources(saved)}
          onSave={() => {
            const aliases = sources.map((s) => s.alias.trim());
            if (aliases.some((a) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(a))) {
              toast.error("An alias is letters, digits and _ only.");
              return;
            }
            if (new Set(aliases).size !== aliases.length) {
              toast.error("Two sources share an alias.");
              return;
            }
            void save({ sources: sources.map((s) => ({ ...s, alias: s.alias.trim() })) });
          }}
        />
      </div>
    </div>
  );
}
