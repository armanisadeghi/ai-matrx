"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { openFilePicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";
import { getFileMetadata } from "@/features/files/api/files";
import { fetchEducationLibraryPage } from "@/features/education/library/service";
import type { EducationLibraryRow } from "@/features/education/library/types";
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";
import { createManualKit, kitHref, kitMembershipFingerprint, readKit } from "../kitService";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationKitsScope, EDUCATION_KITS_SURFACE_NAME } from "@/features/surfaces/manifests/education-kits.manifest";
import { collectionWriteHandlers, readCollectionList } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { recoverManualKitDraft } from "./manualKitDraftRecovery";

const PAGE_SIZE = 25;

export function ManualKitCreator() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const existingSourceId = searchParams.get("source");
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
  const [existingFingerprint, setExistingFingerprint] = useState<string | null>(null);
  const draftKey = `manual-study-kit-draft:${existingSourceId ?? "new"}`;

  useEffect(() => {
    if (existingSourceId && !sourceId) queueMicrotask(() => setSourceId(existingSourceId));
  }, [existingSourceId, sourceId]);
  useEffect(() => {
    if (!existingSourceId) return;
    void readKit("file", existingSourceId).then((kit) => setExistingFingerprint(kit ? kitMembershipFingerprint(kit) : null));
  }, [existingSourceId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      let raw: string | null;
      try { raw = sessionStorage.getItem(draftKey); }
      catch { if (active) setRecoveryReady(true); return; }
      if (!raw) { if (active) setRecoveryReady(true); return; }
      void recoverManualKitDraft(raw, {
        resolveSource: async (id) => {
          const result = await getFileMetadata(id);
          return { name: result.data.file_name };
        },
        resolveRows: async (refs) => {
          const wanted = new Set(refs.map((ref) => `${ref.kind}:${ref.id}`));
          const ids = [...new Set(refs.map((ref) => ref.id))];
          const fresh = new Map<string, EducationLibraryRow>();
          for (let recoveryPage = 1; wanted.size > fresh.size; recoveryPage += 1) {
            const result = await fetchEducationLibraryPage({ ...DEFAULT_ENTITY_LIST_QUERY, scope: { kind: "mine" }, filters: { id: { kind: "select", values: ids } }, page: recoveryPage }, { sort: "updated", direction: "desc", favoritesFirst: false, pageSize: PAGE_SIZE });
            for (const row of result.rows) {
              const key = `${row.kind}:${row.id}`;
              if (wanted.has(key)) fresh.set(key, row);
            }
            if (result.rows.length < PAGE_SIZE || recoveryPage * PAGE_SIZE >= result.total) break;
          }
          return refs.flatMap((ref) => {
            const row = fresh.get(`${ref.kind}:${ref.id}`);
            return row ? [row] : [];
          });
        },
      }, existingSourceId ? { sourceIdOverride: existingSourceId } : undefined).then((draft) => {
        if (!active) return;
        if (!draft) { sessionStorage.removeItem(draftKey); return; }
        setTitle(draft.title);
        if (draft.source) { setSourceId(draft.source.id); setSourceName(draft.source.name); }
        setSelected(draft.selected);
        if (draft.restored) toast.info("Your unsaved kit was restored.");
      }).catch(() => undefined).finally(() => { if (active) setRecoveryReady(true); });
    });
    return () => { active = false; };
  }, [draftKey, existingSourceId]);
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
    current.some((item) => item.id === row.id && item.kind === row.kind) ? current.filter((item) => item.id !== row.id || item.kind !== row.kind) : [...current, row]);
  const save = async () => {
    setSaving(true); setError(null);
    try { await createManualKit({ sourceId: sourceId ?? "", title, artifacts: selected, allowExisting: !!existingSourceId, expectedFingerprint: existingFingerprint ?? undefined }); sessionStorage.removeItem(draftKey); router.push(kitHref("file", sourceId ?? "")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create this kit."); }
    finally { setSaving(false); }
  };
  const candidates = [...new Map([...rows, ...selected].map((row) => [`${row.kind}:${row.id}`, row])).values()];
  const getScope = () => createEducationKitsScope({ view: "new", kit_draft_title: title, kit_source_file_id: sourceId ?? undefined, kit_membership_fingerprint: existingFingerprint ?? undefined, kit_member_candidates: candidates.map((row) => ({ id: row.id, title: row.title, kind: row.kind, subtype: row.subtype })) });
  const getWriteHandlers = () => {
    const create = collectionWriteHandlers({ plural: "kits", singular: "kit", create: {
    parse: (value) => readCollectionList("create_kits", "kits", value, 25).map((raw, index) => {
      if (index > 0) throw new Error("create_kits accepts exactly one kit for the selected source file.");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`create_kits[${index}] must be an object.`);
      const item = raw as Record<string, unknown>;
      if (typeof item.title !== "string" || !item.title.trim()) throw new Error(`create_kits[${index}].title needs text.`);
      if (item.source_file_id !== sourceId) throw new Error(`create_kits[${index}].source_file_id must be the file selected in this creator.`);
      if (existingSourceId && item.expected_membership_fingerprint !== existingFingerprint) throw new Error(`create_kits[${index}].expected_membership_fingerprint is stale. Reload this kit before adding aids.`);
      if (!Array.isArray(item.artifact_refs) || !item.artifact_refs.length) throw new Error(`create_kits[${index}].artifact_refs needs one or more visible study aids.`);
      const refs = item.artifact_refs;
      if (!refs.every((ref) => ref && typeof ref === "object" && typeof (ref as Record<string, unknown>).kind === "string" && typeof (ref as Record<string, unknown>).id === "string")) throw new Error(`create_kits[${index}].artifact_refs must contain { kind, id } objects.`);
      const keys = refs.map((ref) => `${(ref as Record<string, string>).kind}:${(ref as Record<string, string>).id}`);
      if (new Set(keys).size !== keys.length) throw new Error(`create_kits[${index}].artifact_refs must be distinct kind and id pairs.`);
      const artifacts = refs.map((ref) => candidates.find((row) => `${row.kind}:${row.id}` === `${(ref as Record<string, string>).kind}:${(ref as Record<string, string>).id}`));
      if (artifacts.some((row) => !row)) throw new Error(`create_kits[${index}] includes an aid that is not in the current picker.`);
      return { title: item.title.trim(), sourceId: sourceId ?? "", artifacts: artifacts.filter((row): row is EducationLibraryRow => !!row), expectedFingerprint: existingFingerprint ?? undefined };
    }),
    run: async (plan) => { await createManualKit({ sourceId: plan.sourceId, title: plan.title, artifacts: plan.artifacts, allowExisting: !!existingSourceId, expectedFingerprint: plan.expectedFingerprint }); return { id: plan.sourceId, name: plan.title }; },
    nameOf: (plan) => plan.title,
    } }, refuseSurfaceWrite);
    if (!existingSourceId) return create;
    return { add_kit_members: create.create_kits };
  };
  return <SurfaceRuntimeProvider surfaceName={EDUCATION_KITS_SURFACE_NAME} getScope={getScope} getWriteHandlers={getWriteHandlers}><main className="mx-auto w-full max-w-3xl space-y-5 p-4">
    <h1 className="text-xl font-semibold">{existingSourceId ? "Add saved aids" : "Create a study kit"}</h1>
    <p className="text-sm text-muted-foreground">Group saved study aids under one saved source file. Your aids are not copied or changed.</p>
    <label className="block text-sm font-medium">Kit title<Input className="mt-1" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    {!existingSourceId && <Button variant="outline" onClick={() => void chooseFile()}>{sourceId ? "Change source file" : "Choose source file"}</Button>}
    {sourceId && <p className="text-xs text-muted-foreground">Source: <a className="underline" href={`/files/f/${sourceId}`}>{sourceName ?? "Selected file"}</a></p>}
    <label className="block text-sm font-medium">Find saved study aids<Input className="mt-1" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
    <div className="space-y-2 rounded-xl border border-border p-3">
      {rows.map((row) => <label key={`${row.kind}:${row.id}`} className="flex cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={selected.some((item) => item.id === row.id && item.kind === row.kind)} onChange={() => toggle(row)} />{row.title}</label>)}
      {loading && <p className="text-sm text-muted-foreground">Loading study aids…</p>}
      {!loading && !rows.length && !error && <p className="text-sm text-muted-foreground">No matching study aids.</p>}
    </div>
    <div className="flex justify-between"><Button variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-sm text-muted-foreground">{page * PAGE_SIZE < total ? "More results available" : "End of results"}</span><Button variant="outline" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error} <ErrorAlchemyMenu error={error} /></p>}
    <div className="flex gap-2"><Button variant="outline" onClick={() => { sessionStorage.removeItem(draftKey); router.push("/education/kits"); }}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : existingSourceId ? "Add saved aids" : "Create kit"}</Button></div>
  </main></SurfaceRuntimeProvider>;
}
