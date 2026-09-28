"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { openFilePicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";
import { getFileMetadata } from "@/features/files/api/files";
import { fetchEducationLibraryPage } from "@/features/education/library/service";
import type { EducationLibraryRow } from "@/features/education/library/types";
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";
import { createManualKit, kitHref } from "../kitService";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationKitsScope, EDUCATION_KITS_SURFACE_NAME } from "@/features/surfaces/manifests/education-kits.manifest";
import { collectionWriteHandlers, readCollectionList } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";

const PAGE_SIZE = 25;

export function ManualKitCreator() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<EducationLibraryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<EducationLibraryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const draftKey = "manual-study-kit-draft";

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      const raw = sessionStorage.getItem(draftKey);
      if (!active || !raw) return;
      try {
        const draft = JSON.parse(raw) as { title?: string; sourceId?: string; sourceName?: string; selected?: EducationLibraryRow[] };
        if (typeof draft.title === "string") setTitle(draft.title);
        if (typeof draft.sourceId === "string") setSourceId(draft.sourceId);
        if (typeof draft.sourceName === "string") setSourceName(draft.sourceName);
        if (Array.isArray(draft.selected)) setSelected(draft.selected);
        toast.info("Your unsaved kit was restored.");
      } catch { sessionStorage.removeItem(draftKey); }
      finally { if (active) setRecoveryReady(true); }
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!recoveryReady) return;
    const dirty = Boolean(title || sourceId || selected.length);
    if (!dirty) { sessionStorage.removeItem(draftKey); return; }
    sessionStorage.setItem(draftKey, JSON.stringify({ title, sourceId, sourceName, selected: selected.map((row) => ({ kind: row.kind, id: row.id })) }));
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recoveryReady, sourceId, sourceName, selected, title]);

  useEffect(() => {
    let active = true;
    void fetchEducationLibraryPage({ ...DEFAULT_ENTITY_LIST_QUERY, scope: { kind: "mine" }, search, page }, { sort: "updated", direction: "desc", favoritesFirst: false, pageSize: PAGE_SIZE })
      .then((result) => { if (active) { setRows(result.rows); setTotal(result.total); setLoading(false); } })
      .catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : "Could not load your study aids."); setLoading(false); } });
    return () => { active = false; };
  }, [page, search]);

  const chooseFile = async () => {
    try {
      const ids = await openFilePicker({ title: "Choose source material", multi: false });
      if (!ids?.[0]) return;
      const result = await getFileMetadata(ids[0]);
      setSourceId(ids[0]); setSourceName(result.data.file_name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not choose the source file."); }
  };
  const toggle = (row: EducationLibraryRow) => setSelected((current) =>
    current.some((item) => item.id === row.id) ? current.filter((item) => item.id !== row.id) : [...current, row]);
  const save = async () => {
    setSaving(true); setError(null);
    try { await createManualKit({ sourceId: sourceId ?? "", title, artifacts: selected }); sessionStorage.removeItem(draftKey); router.push(kitHref("file", sourceId ?? "")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create this kit."); }
    finally { setSaving(false); }
  };
  const candidates = [...new Map([...rows, ...selected].map((row) => [row.id, row])).values()];
  const getScope = () => createEducationKitsScope({ view: "new", kit_draft_title: title, kit_source_file_id: sourceId ?? undefined, kit_member_candidates: candidates.map((row) => ({ id: row.id, title: row.title, kind: row.kind, subtype: row.subtype })) });
  const getWriteHandlers = () => collectionWriteHandlers({ plural: "kits", singular: "kit", create: {
    parse: (value) => readCollectionList("create_kits", "kits", value, 25).map((raw, index) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`create_kits[${index}] must be an object.`);
      const item = raw as Record<string, unknown>;
      if (typeof item.title !== "string" || !item.title.trim()) throw new Error(`create_kits[${index}].title needs text.`);
      if (item.source_file_id !== sourceId) throw new Error(`create_kits[${index}].source_file_id must be the file selected in this creator.`);
      if (!Array.isArray(item.artifact_ids) || !item.artifact_ids.length) throw new Error(`create_kits[${index}].artifact_ids needs one or more visible study aids.`);
      const ids = item.artifact_ids;
      if (!ids.every((id) => typeof id === "string") || new Set(ids).size !== ids.length) throw new Error(`create_kits[${index}].artifact_ids must be distinct ids.`);
      const artifacts = ids.map((id) => candidates.find((row) => row.id === id));
      if (artifacts.some((row) => !row)) throw new Error(`create_kits[${index}] includes an aid that is not in the current picker.`);
      return { title: item.title.trim(), sourceId: sourceId ?? "", artifacts: artifacts as EducationLibraryRow[] };
    }),
    run: async (plan) => { await createManualKit({ sourceId: plan.sourceId, title: plan.title, artifacts: plan.artifacts }); return { id: plan.sourceId, name: plan.title }; },
    nameOf: (plan) => plan.title,
  } }, refuseSurfaceWrite);
  return <SurfaceRuntimeProvider surfaceName={EDUCATION_KITS_SURFACE_NAME} getScope={getScope} getWriteHandlers={getWriteHandlers}><main className="mx-auto w-full max-w-3xl space-y-5 p-4">
    <h1 className="text-xl font-semibold">Create a study kit</h1>
    <p className="text-sm text-muted-foreground">Group saved study aids under one saved source file. Your aids are not copied or changed.</p>
    <label className="block text-sm font-medium">Kit title<Input className="mt-1" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <Button variant="outline" onClick={() => void chooseFile()}>{sourceId ? "Change source file" : "Choose source file"}</Button>
    {sourceId && <p className="text-xs text-muted-foreground">Source: <a className="underline" href={`/files/f/${sourceId}`}>{sourceName ?? "Selected file"}</a></p>}
    <label className="block text-sm font-medium">Find saved study aids<Input className="mt-1" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
    <div className="space-y-2 rounded-xl border border-border p-3">
      {rows.map((row) => <label key={row.id} className="flex cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={selected.some((item) => item.id === row.id)} onChange={() => toggle(row)} />{row.title}</label>)}
      {loading && <p className="text-sm text-muted-foreground">Loading study aids…</p>}
      {!loading && !rows.length && !error && <p className="text-sm text-muted-foreground">No matching study aids.</p>}
    </div>
    <div className="flex justify-between"><Button variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-sm text-muted-foreground">{page * PAGE_SIZE < total ? "More results available" : "End of results"}</span><Button variant="outline" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error} <ErrorAlchemyMenu error={error} /></p>}
    <div className="flex gap-2"><Button variant="outline" onClick={() => { sessionStorage.removeItem(draftKey); router.push("/education/kits"); }}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? "Creating…" : "Create kit"}</Button></div>
  </main></SurfaceRuntimeProvider>;
}
