"use client";

// /education/kits/new — the manual kit creator: a kit made from picked material,
// plus any saved study aids, nothing generated. The material is picked in THE one
// Source input (`features/resource-manager/source-input`, the same input as
// /education/start and /education/flashcards/new). A new kit holds EVERY picked
// Source itself (`kitScope.ts`), exactly like a kit made at /education/start.
// Opened on an existing kit (`?source=&from=`) it only adds saved aids.

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@ai-matrx/design-system";
import { Input } from "@ai-matrx/design-system";
import { createSourceRef } from "@ai-matrx/agents/sources";
import type { SourceTileId } from "@ai-matrx/agents/sources/runtime";
import { SourceInput } from "@/features/resource-manager/source-input/components/SourceInput";
import { useSourceSet } from "@/features/resource-manager/source-input/useSourceSet";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { kitSourceRefs, pickedFileAnchor } from "@/features/education/onboard/kitSources";
import { getFileMetadata } from "@/features/files/api/files";
import { fetchEducationLibraryPage } from "@/features/education/library/service";
import type { EducationLibraryRow } from "@/features/education/library/types";
import { educationLibraryHref } from "@/features/education/library/types";
import { artifactVisual } from "@/features/education/library/artifactVisuals";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";
import { createManualKit, createMultiSourceKit, isManualKitSourceType, kitHref, kitMembershipFingerprint, readKit, type ManualKitSourceType } from "../kitService";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { describeFailure } from "@/lib/failure/transport";
import { toast } from "@/lib/toast";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationKitsScope, EDUCATION_KITS_SURFACE_NAME } from "@/features/surfaces/manifests/education-kits.manifest";
import { collectionWriteHandlers, readCollectionList } from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { recoverManualKitDraft } from "./manualKitDraftRecovery";

const PAGE_SIZE = 25;
/** The Source input's key on this page — picks are held and kept under it. */
export const MANUAL_KIT_SOURCES_KEY = "education:kits:new";
/** Every door but "Topic": a kit is grouped under real material. */
const KIT_SOURCE_KINDS: readonly SourceTileId[] = ["upload", "paste", "web", "youtube", "audio", "image", "existing"];

export function ManualKitCreator({
  onMade,
}: {
  /** The kit was made: the host (a Board tile) takes it from here and drops Cancel; the page itself opens the kit. */
  onMade?: (kit: { sourceType: string; sourceId: string; title: string }) => void;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedSourceId = searchParams.get("source");
  const requestedSourceType = searchParams.get("from") ?? "file";
  const set = useSourceSet(MANUAL_KIT_SOURCES_KEY);
  const [title, setTitle] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<ManualKitSourceType>("file");
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<EducationLibraryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<EducationLibraryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recoveryReadyKey, setRecoveryReadyKey] = useState<string | null>(null);
  const [existingFingerprint, setExistingFingerprint] = useState<string | null>(null);
  const [isExistingKit, setIsExistingKit] = useState(false);
  const [sourceReady, setSourceReady] = useState(!requestedSourceId);
  const draftKey = `manual-study-kit-draft:${requestedSourceType}:${requestedSourceId ?? "new"}`;
  const recoveryQueryRef = useRef(draftKey);
  const existingKitRef = useRef(false);
  const recoveryReady = recoveryReadyKey === draftKey;
  const pickedReady = set.sources.filter((c) => c.status === "ready" && c.draft.ref);
  const pickedLanding = set.sources.some((c) => c.status === "pending" || c.status === "resolving");
  // The file the new kit will anchor on, when the picks name one without a server read.
  const pickedFileId = pickedFileAnchor(set.sources);
  const saveReady = isExistingKit
    ? sourceReady && sourceId === requestedSourceId && sourceType === requestedSourceType
    : sourceReady && isManualKitSourceType(requestedSourceType) && pickedReady.length > 0 && !pickedLanding;

  const seedFile = useEffectEvent((fileId: string, name: string) => {
    if (set.hasRef("file", fileId)) return;
    set.addReady({ kind: "files", label: name, ref: createSourceRef("file", fileId), fileId });
  });
  useEffect(() => {
    let active = true;
    if (!requestedSourceId) {
      queueMicrotask(() => {
        if (!active) return;
        setSourceReady(true);
        setIsExistingKit(false);
        existingKitRef.current = false;
        setExistingFingerprint(null);
        setSourceId(null);
        setSourceType("file");
        setSourceName(null);
        setTitle("");
        setSelected([]);
      });
      return () => { active = false; };
    }
    if (!isManualKitSourceType(requestedSourceType)) {
      queueMicrotask(() => {
        setError("This kit source type is not supported.");
        setSourceReady(false);
      });
      return;
    }
    queueMicrotask(() => {
      if (!active) return;
      setSourceReady(false);
      setIsExistingKit(false);
      existingKitRef.current = false;
      setExistingFingerprint(null);
      setSourceId(null);
      setSourceType("file");
      setSourceName(null);
      setTitle("");
      setSelected([]);
    });
    void readKit(requestedSourceType, requestedSourceId).then(async (kit) => {
      if (!active) return;
      setSourceType(requestedSourceType);
      setSourceId(requestedSourceId);
      if (kit) {
        setExistingFingerprint(kitMembershipFingerprint(kit));
        setTitle(kit.title);
        setIsExistingKit(true);
        existingKitRef.current = true;
        if (requestedSourceType === "file") {
          const file = await getFileMetadata(requestedSourceId);
          if (!active) return;
          setSourceName(file.data.file_name);
        } else {
          setSourceName(kit.title);
        }
        setSourceReady(true);
        return;
      }
      if (requestedSourceType !== "file") throw new Error("This kit no longer exists.");
      const file = await getFileMetadata(requestedSourceId);
      if (!active) return;
      // A new kit from a file handed over in the link: that file is the first pick.
      seedFile(requestedSourceId, file.data.file_name);
      setSourceId(null);
      setSourceName(null);
      setIsExistingKit(false);
      setSourceReady(true);
    }).catch((cause) => {
      if (!active) return;
      setError(describeFailure(cause, { action: "loading this kit", read: true, fallback: "Could not load this kit." }).sentence);
      setSourceReady(false);
    });
    return () => { active = false; };
  }, [requestedSourceId, requestedSourceType]);

  useEffect(() => {
    let active = true;
    recoveryQueryRef.current = draftKey;
    queueMicrotask(() => {
      let raw: string | null;
      try { raw = sessionStorage.getItem(draftKey); }
      catch {
        if (active) {
          setError("Could not restore your saved kit draft. You can continue creating a kit.");
          setRecoveryReadyKey(draftKey);
        }
        return;
      }
      if (!raw) { if (active) setRecoveryReadyKey(draftKey); return; }
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
      }, requestedSourceId ? {
        // A non-file anchor is already resolved by the kit read above. Draft
        // recovery only knows how to look up files, so never send it a note,
        // assessment, deck, or processed-document id.
        sourceIdOverride: requestedSourceType === "file" ? requestedSourceId : null,
      } : undefined).then((draft) => {
        if (!active || recoveryQueryRef.current !== draftKey) return;
        if (!draft) {
          try { sessionStorage.removeItem(draftKey); }
          catch { setError("Could not clear an invalid saved kit draft. You can continue creating a kit."); }
          return;
        }
        // A URL-selected anchor owns its title. Its draft can restore selected
        // aids, but may not replace the title loaded from that anchor's kit.
        if (!requestedSourceId || !existingKitRef.current) setTitle(draft.title);
        // The material itself comes back with the Source input's own draft.
        setSelected(draft.selected);
        if (draft.restored) toast.info("Your unsaved kit was restored.");
      }).catch((cause) => {
        if (active && recoveryQueryRef.current === draftKey) setError(cause instanceof Error ? `Could not restore your saved kit draft: ${cause.message}` : "Could not restore your saved kit draft. You can continue creating a kit.");
      }).finally(() => { if (active && recoveryQueryRef.current === draftKey) setRecoveryReadyKey(draftKey); });
    });
    return () => { active = false; };
  }, [draftKey, requestedSourceId, requestedSourceType]);
  useEffect(() => {
    if (!recoveryReady) return;
    const dirty = Boolean(title || selected.length);
    try {
      if (!dirty) { sessionStorage.removeItem(draftKey); return; }
      sessionStorage.setItem(draftKey, JSON.stringify({ title, selected: selected.map((row) => ({ kind: row.kind, id: row.id })) }));
    } catch {
      toast.error("Could not save your kit draft in this browser. You can still create the kit.");
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftKey, recoveryReady, selected, title]);

  useEffect(() => {
    let active = true;
    void fetchEducationLibraryPage({ ...DEFAULT_ENTITY_LIST_QUERY, scope: { kind: "mine" }, search, page }, { sort: "updated", direction: "desc", favoritesFirst: false, pageSize: PAGE_SIZE })
      .then((result) => { if (active) { setRows(result.rows); setTotal(result.total); setLoading(false); } })
      .catch((cause) => { if (active) { setError(describeFailure(cause, { action: "loading your study aids", read: true, fallback: "Could not load your study aids." }).sentence); setLoading(false); } });
    return () => { active = false; };
  }, [page, search]);

  /**
   * A new kit holds every picked Source itself (the same model as /education/start):
   * the picks are read once, then each is filed under a new kit record.
   */
  const makeNewKit = async (kitTitle: string, artifacts: readonly EducationLibraryRow[]): Promise<string> => {
    const resolved = await set.resolve();
    const sources = kitSourceRefs(resolved);
    if (!sources.length) throw new Error("None of the picked material had any text. Check each Source, or add another.");
    return createMultiSourceKit({ orgId: await ensureOrgId(null), title: kitTitle, sources, artifacts });
  };
  const toggle = (row: EducationLibraryRow) => setSelected((current) =>
    current.some((item) => item.id === row.id && item.kind === row.kind) ? current.filter((item) => item.id !== row.id || item.kind !== row.kind) : [...current, row]);
  const clearDraft = () => {
    for (const card of set.sources) set.remove(card.id);
    try { sessionStorage.removeItem(draftKey); }
    catch { setError("Could not clear your saved kit draft. You can still leave this page."); }
  };
  const save = async () => {
    setSaving(true); setError(null);
    try {
      const anchorType = isExistingKit ? sourceType : "scope";
      let anchorId = sourceId ?? "";
      if (isExistingKit) await createManualKit({ sourceId: anchorId, sourceType: anchorType, title, artifacts: selected, allowExisting: true, expectedFingerprint: existingFingerprint ?? undefined });
      else anchorId = await makeNewKit(title, selected);
      clearDraft();
      if (onMade) onMade({ sourceType: anchorType, sourceId: anchorId, title });
      else router.push(kitHref(anchorType, anchorId));
    }
    catch (cause) { setError(describeFailure(cause, { action: "creating this kit", fallback: "Could not create this kit." }).sentence); }
    finally { setSaving(false); }
  };
  const candidates = [...new Map([...rows, ...selected].map((row) => [`${row.kind}:${row.id}`, row])).values()];
  const getScope = () => createEducationKitsScope({ view: "new", kit_draft_title: title, kit_source_id: sourceId ?? undefined, kit_source_type: sourceId ? sourceType : undefined, kit_source_file_id: isExistingKit ? (sourceType === "file" ? sourceId ?? undefined : undefined) : pickedFileId ?? undefined, kit_sources: isExistingKit ? undefined : set.sources.map((card) => ({ name: card.draft.label, status: card.status })), kit_membership_fingerprint: existingFingerprint ?? undefined, kit_member_candidates: candidates.map((row) => ({ id: row.id, title: row.title, kind: row.kind, subtype: row.subtype })) });
  const getWriteHandlers = () => {
    const create = collectionWriteHandlers({ plural: "kits", singular: "kit", create: {
    parse: (value) => readCollectionList("create_kits", "kits", value, 25).map((raw, index) => {
      if (index > 0) throw new Error("create_kits accepts exactly one kit for the selected source file.");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`create_kits[${index}] must be an object.`);
      const item = raw as Record<string, unknown>;
      if (typeof item.title !== "string" || !item.title.trim()) throw new Error(`create_kits[${index}].title needs text.`);
      if (isExistingKit) {
        if (item.source_id !== sourceId || item.source_type !== sourceType) throw new Error(`create_kits[${index}].source_id and source_type must identify the open kit.`);
      } else {
        if (!pickedReady.length || pickedLanding) throw new Error(`create_kits[${index}] needs the material picked first; kit_sources lists what is picked.`);
        if (item.source_file_id !== undefined && item.source_file_id !== pickedFileId) throw new Error(`create_kits[${index}].source_file_id must equal kit_source_file_id, or be left out.`);
      }
      if (isExistingKit && item.expected_membership_fingerprint !== existingFingerprint) throw new Error(`create_kits[${index}].expected_membership_fingerprint is stale. Reload this kit before adding aids.`);
      if (!Array.isArray(item.artifact_refs) || !item.artifact_refs.length) throw new Error(`create_kits[${index}].artifact_refs needs one or more visible study aids.`);
      const refs = item.artifact_refs;
      if (!refs.every((ref) => ref && typeof ref === "object" && typeof (ref as Record<string, unknown>).kind === "string" && typeof (ref as Record<string, unknown>).id === "string")) throw new Error(`create_kits[${index}].artifact_refs must contain { kind, id } objects.`);
      const keys = refs.map((ref) => `${(ref as Record<string, string>).kind}:${(ref as Record<string, string>).id}`);
      if (new Set(keys).size !== keys.length) throw new Error(`create_kits[${index}].artifact_refs must be distinct kind and id pairs.`);
      const artifacts = refs.map((ref) => candidates.find((row) => `${row.kind}:${row.id}` === `${(ref as Record<string, string>).kind}:${(ref as Record<string, string>).id}`));
      if (artifacts.some((row) => !row)) throw new Error(`create_kits[${index}] includes an aid that is not in the current picker.`);
      return { title: item.title.trim(), artifacts: artifacts.filter((row): row is EducationLibraryRow => !!row), expectedFingerprint: existingFingerprint ?? undefined };
    }),
    run: async (plan) => {
      if (isExistingKit) {
        await createManualKit({ sourceId: sourceId ?? "", sourceType, title: plan.title, artifacts: plan.artifacts, allowExisting: true, expectedFingerprint: plan.expectedFingerprint });
        return { id: sourceId ?? "", name: plan.title };
      }
      return { id: await makeNewKit(plan.title, plan.artifacts), name: plan.title };
    },
    nameOf: (plan) => plan.title,
    } }, refuseSurfaceWrite);
    if (!isExistingKit) return create;
    return { add_kit_members: create.create_kits };
  };
  return <SurfaceRuntimeProvider surfaceName={EDUCATION_KITS_SURFACE_NAME} getScope={getScope} getWriteHandlers={getWriteHandlers}><main className="mx-auto w-full max-w-3xl space-y-5 p-4">
    <h1 className="text-xl font-semibold">{isExistingKit ? "Add saved aids" : "Create a study kit"}</h1>
    <label className="block text-sm font-medium">Kit title<Input className="mt-1" value={title} readOnly={isExistingKit} onChange={(event) => setTitle(event.target.value)} /></label>
    {!isExistingKit && <SourceInput surfaceKey={MANUAL_KIT_SOURCES_KEY} title="Material" purpose="your study kit" required kinds={KIT_SOURCE_KINDS} />}
    {isExistingKit && sourceId && <p className="text-xs text-muted-foreground">Source: <EntityRef token={sourceType} id={sourceId} name={sourceName ?? "Selected source"} openInNewTab showIcon={false} /></p>}
    <label className="block text-sm font-medium">Find saved study aids<Input className="mt-1" placeholder="Search by name or type, like flashcards" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
    <p className="text-xs text-muted-foreground">Choose any saved study aid, including a deck made in chat.</p>
    <div className="space-y-2 rounded-xl border border-border p-3">
      {rows.map((row) => <div key={`${row.kind}:${row.id}`} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted/50">
        <input type="checkbox" aria-label={`Add ${row.title}`} checked={selected.some((item) => item.id === row.id && item.kind === row.kind)} onChange={() => toggle(row)} />
        <EntityRef token={row.kind} id={row.id} name={row.title} href={educationLibraryHref(row)} openInNewTab showIcon={false} fill className="min-w-0 flex-1" />
        <span className="shrink-0 text-xs text-muted-foreground">{artifactVisual(row.subtype).label}</span>
      </div>)}
      {loading && <p className="text-sm text-muted-foreground">Loading study aids…</p>}
      {!loading && !rows.length && !error && <p className="text-sm text-muted-foreground">No matching study aids.</p>}
    </div>
    <div className="flex justify-between"><Button variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-sm text-muted-foreground">{page * PAGE_SIZE < total ? "More results available" : "End of results"}</span><Button variant="outline" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
    {error && <ErrorNotice size="inline" message={error} error={error} operation="Make a study kit" />}
    <div className="flex gap-2">{onMade ? null : <Button variant="outline" onClick={() => { clearDraft(); router.push("/education/kits"); }}>Cancel</Button>}<Button disabled={saving || !saveReady} onClick={() => void save()}>{saving ? "Saving…" : isExistingKit ? "Add saved aids" : "Create kit"}</Button></div>
  </main></SurfaceRuntimeProvider>;
}
