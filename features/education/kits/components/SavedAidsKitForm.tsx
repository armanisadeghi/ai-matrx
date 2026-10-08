"use client";

// features/education/kits/components/SavedAidsKitForm.tsx
//
// The "Saved aids" mode of THE create page (/education/kits/new): a new kit
// made from the picked material plus study aids the learner already saved —
// nothing generated. The material is THE page's Source input (the host passes
// its set); the result is the same multi-source kit the AI mode makes
// (`createMultiSourceKit`, kitScope.ts). Adding aids to an EXISTING kit happens
// on the kit page (KitHub → Add saved aids), never here.
//
// Its agent surface is `matrx-user/education-kits`, view "new", nested inside
// the page's `education-start` surface (the deeper provider is primary).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@ai-matrx/design-system";
import { ProInput } from "@/components/official/ProInput";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { kitSourceRefs, pickedFileAnchor } from "@/features/education/onboard/kitSources";
import { fetchEducationLibraryPage } from "@/features/education/library/service";
import type { EducationLibraryRow } from "@/features/education/library/types";
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";
import type { UseSourceSetResult } from "@/features/resource-manager/source-input/useSourceSet";
import { createMultiSourceKit, kitHref } from "../kitService";
import { KIT_TOKEN } from "../kitScope";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { describeFailure } from "@/lib/failure/transport";
import { toast } from "@/lib/toast";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationKitsScope, EDUCATION_KITS_SURFACE_NAME } from "@/features/surfaces/manifests/education-kits.manifest";
import { collectionWriteHandlers, readCollectionList } from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { recoverManualKitDraft } from "./manualKitDraftRecovery";
import { SavedAidPicker, SAVED_AID_PAGE_SIZE, savedAidKey } from "./SavedAidPicker";

/** The unsaved title + chosen aids, kept per tab so a reload loses nothing. */
const DRAFT_KEY = "manual-study-kit-draft:new";

export function SavedAidsKitForm({
  set,
  onMade,
}: {
  /** THE page's Source input set: the material this kit is filed under. */
  set: UseSourceSetResult;
  /** A Board tile takes the made kit; the page itself opens the kit. */
  onMade?: (kit: { sourceType: string; sourceId: string; title: string }) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<EducationLibraryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const shownRows = useRef<EducationLibraryRow[]>([]);

  const pickedReady = set.sources.filter((c) => c.status === "ready" && c.draft.ref);
  const pickedLanding = set.sources.some((c) => c.status === "pending" || c.status === "resolving");
  const pickedFileId = pickedFileAnchor(set.sources);
  const saveReady = pickedReady.length > 0 && !pickedLanding && title.trim().length > 0;

  // Restore an unsaved draft (identities only; rows re-read so a stale session
  // value never reaches the kit writer).
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      let raw: string | null;
      try { raw = sessionStorage.getItem(DRAFT_KEY); }
      catch {
        if (active) { setError("Could not restore your saved kit draft. You can continue creating a kit."); setRecoveryReady(true); }
        return;
      }
      if (!raw) { if (active) setRecoveryReady(true); return; }
      void recoverManualKitDraft(raw, {
        resolveSource: async () => ({ name: "" }),
        resolveRows: async (refs) => {
          const wanted = new Set(refs.map((ref) => `${ref.kind}:${ref.id}`));
          const ids = [...new Set(refs.map((ref) => ref.id))];
          const fresh = new Map<string, EducationLibraryRow>();
          for (let page = 1; wanted.size > fresh.size; page += 1) {
            const result = await fetchEducationLibraryPage(
              { ...DEFAULT_ENTITY_LIST_QUERY, scope: { kind: "mine" }, filters: { id: { kind: "select", values: ids } }, page },
              { sort: "updated", direction: "desc", favoritesFirst: false, pageSize: SAVED_AID_PAGE_SIZE },
            );
            for (const row of result.rows) if (wanted.has(savedAidKey(row))) fresh.set(savedAidKey(row), row);
            if (result.rows.length < SAVED_AID_PAGE_SIZE || page * SAVED_AID_PAGE_SIZE >= result.total) break;
          }
          return refs.flatMap((ref) => fresh.get(`${ref.kind}:${ref.id}`) ?? []);
        },
      }, { sourceIdOverride: null }).then((draft) => {
        if (!active) return;
        if (!draft) {
          try { sessionStorage.removeItem(DRAFT_KEY); }
          catch { setError("Could not clear an invalid saved kit draft. You can continue creating a kit."); }
          return;
        }
        setTitle(draft.title);
        setSelected(draft.selected);
        if (draft.restored) toast.info("Your unsaved kit was restored.");
      }).catch((cause) => {
        if (active) setError(cause instanceof Error ? `Could not restore your saved kit draft: ${cause.message}` : "Could not restore your saved kit draft. You can continue creating a kit.");
      }).finally(() => { if (active) setRecoveryReady(true); });
    });
    return () => { active = false; };
  }, []);

  // Keep the draft and warn before leaving while it holds anything.
  useEffect(() => {
    if (!recoveryReady) return;
    const dirty = Boolean(title || selected.length);
    try {
      if (!dirty) { sessionStorage.removeItem(DRAFT_KEY); return; }
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ title, selected: selected.map((row) => ({ kind: row.kind, id: row.id })) }));
    } catch {
      toast.error("Could not save your kit draft in this browser. You can still create the kit.");
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recoveryReady, selected, title]);

  const toggle = (row: EducationLibraryRow) => setSelected((current) =>
    current.some((item) => savedAidKey(item) === savedAidKey(row))
      ? current.filter((item) => savedAidKey(item) !== savedAidKey(row))
      : [...current, row]);

  const clearDraft = () => {
    for (const card of set.sources) set.remove(card.id);
    setTitle("");
    setSelected([]);
    try { sessionStorage.removeItem(DRAFT_KEY); }
    catch { setError("Could not clear your saved kit draft. You can still leave this page."); }
  };

  /** The same kit the AI mode makes: its own record, each picked Source filed under it, then the aids. */
  const makeKit = async (kitTitle: string, artifacts: readonly EducationLibraryRow[]): Promise<string> => {
    const resolved = await set.resolve();
    const sources = kitSourceRefs(resolved);
    if (!sources.length) throw new Error("None of the picked material had any text. Check each Source, or add another.");
    return createMultiSourceKit({ orgId: await ensureOrgId(null), title: kitTitle, sources, artifacts });
  };

  const finish = (kitId: string, kitTitle: string) => {
    clearDraft();
    if (onMade) onMade({ sourceType: KIT_TOKEN, sourceId: kitId, title: kitTitle });
    else router.push(kitHref(KIT_TOKEN, kitId));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const kitTitle = title.trim();
      finish(await makeKit(kitTitle, selected), kitTitle);
    } catch (cause) {
      setError(describeFailure(cause, { action: "creating this kit", fallback: "Could not create this kit." }).sentence);
    } finally {
      setSaving(false);
    }
  };

  const candidates = () => [...new Map([...shownRows.current, ...selected].map((row) => [savedAidKey(row), row])).values()];
  const getScope = () => createEducationKitsScope({
    view: "new",
    kit_draft_title: title,
    kit_source_file_id: pickedFileId ?? undefined,
    kit_sources: set.sources.map((card) => ({ name: card.draft.label, status: card.status })),
    kit_member_candidates: candidates().map((row) => ({ id: row.id, title: row.title, kind: row.kind, subtype: row.subtype })),
  });
  const getWriteHandlers = () => collectionWriteHandlers({ plural: "kits", singular: "kit", create: {
    parse: (value) => readCollectionList("create_kits", "kits", value, 25).map((raw, index) => {
      if (index > 0) throw new Error("create_kits accepts exactly one kit for the picked material.");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`create_kits[${index}] must be an object.`);
      const item = raw as Record<string, unknown>;
      if (typeof item.title !== "string" || !item.title.trim()) throw new Error(`create_kits[${index}].title needs text.`);
      if (!pickedReady.length || pickedLanding) throw new Error(`create_kits[${index}] needs the material picked first; kit_sources lists what is picked.`);
      if (item.source_file_id !== undefined && item.source_file_id !== pickedFileId) throw new Error(`create_kits[${index}].source_file_id must equal kit_source_file_id, or be left out.`);
      if (!Array.isArray(item.artifact_refs) || !item.artifact_refs.length) throw new Error(`create_kits[${index}].artifact_refs needs one or more visible study aids.`);
      const refs = item.artifact_refs;
      if (!refs.every((ref) => ref && typeof ref === "object" && typeof (ref as Record<string, unknown>).kind === "string" && typeof (ref as Record<string, unknown>).id === "string")) throw new Error(`create_kits[${index}].artifact_refs must contain { kind, id } objects.`);
      const keys = refs.map((ref) => `${(ref as Record<string, string>).kind}:${(ref as Record<string, string>).id}`);
      if (new Set(keys).size !== keys.length) throw new Error(`create_kits[${index}].artifact_refs must be distinct kind and id pairs.`);
      const pool = candidates();
      const artifacts = keys.map((key) => pool.find((row) => savedAidKey(row) === key));
      if (artifacts.some((row) => !row)) throw new Error(`create_kits[${index}] includes an aid that is not in the current picker.`);
      return { title: item.title.trim(), artifacts: artifacts.filter((row): row is EducationLibraryRow => !!row) };
    }),
    run: async (plan) => {
      const id = await makeKit(plan.title, plan.artifacts);
      finish(id, plan.title);
      return { id, name: plan.title };
    },
    nameOf: (plan) => plan.title,
  } }, refuseSurfaceWrite);

  return (
    <SurfaceRuntimeProvider surfaceName={EDUCATION_KITS_SURFACE_NAME} getScope={getScope} getWriteHandlers={getWriteHandlers}>
      <div className="space-y-5">
        <label className="block text-sm font-medium">
          Kit title
          <ProInput className="mt-1" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <SavedAidPicker selected={selected} onToggle={toggle} onVisibleRows={(rows) => { shownRows.current = rows; }} />
        {error && <ErrorNotice size="inline" message={error} error={error} operation="Make a study kit" />}
        <div className="flex gap-2">
          {!onMade && (
            <Button variant="outline" onClick={() => { clearDraft(); router.push("/education/kits"); }}>Cancel</Button>
          )}
          <Button className="flex-1" disabled={saving || !saveReady} onClick={() => void save()}>
            {saving ? "Saving…" : "Create kit"}
          </Button>
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}
