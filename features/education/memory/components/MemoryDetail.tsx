"use client";

// features/education/memory/components/MemoryDetail.tsx
//
// A stored memory-aid set: the mnemonics/analogies/palace view + its trust
// sources + edit controls for authorized collaborators, and owner-only
// regenerate / delete / share controls. Mirrors MindMapDetail.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ellipsis, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@ai-matrx/design-system";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { SourceCitations } from "@/features/education/trust/components/SourceCitations";
import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { MadeFromSource } from "@/features/education/convert/MadeFromSource";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { useAccess } from "@/utils/permissions/access";
import { canEditAccess } from "@/utils/permissions/access-core";
import { studyMediaService } from "@/features/education/media/service";
import { useStudyMediaAuthReady } from "@/features/education/media/authLoad";
import type { StudyMediaRow } from "@/features/education/media/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationMemoryScope } from "@/features/surfaces/manifests/education-memory.manifest";
import MemoryAidBlock, { type MemoryItemKind } from "@/components/mardown-display/blocks/memory-aid/MemoryAidBlock";
import { coerceMemoryAid, coerceMemoryAidPartial, type MemoryAidPayload } from "@/features/content-ir/kinds/memory-aid";
import { MemoryEditor } from "./MemoryEditor";
import { MemoryItemEditor } from "./MemoryItemEditor";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { parseCreateMemoryAids, parseMemoryAid, parseMemoryIds, parseUpdateMemoryAids } from "../memoryWrites";
import { parseMemoryItemChange, removeMemoryItem } from "../memoryItemWrites";
import { ContentFindControl } from "@/features/rich-document/search/ContentFindControl";

const SURFACE_NAME = "matrx-user/education-memory";

export function MemoryDetail({ mediaId, edit = false }: { mediaId: string; edit?: boolean }) {
  const router = useRouter();
  const [media, setMedia] = useState<StudyMediaRow | null>(null);
  const [loading, setLoading] = useState(true);
  // The raw failure, never a sentence — the access gate decides what it means.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [findOpen, setFindOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{ kind: MemoryItemKind; index: number } | null>(null);
  const [itemDraft, setItemDraft] = useState<MemoryAidPayload | null>(null);
  const [itemBaseVersion, setItemBaseVersion] = useState<number | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [itemSaving, setItemSaving] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const access = useAccess("study_media", mediaId);
  const { isOwner } = access;
  const canEdit = !access.loading && canEditAccess(access.level);
  // A persisted Redux identity can briefly precede Supabase's restored
  // browser session; firing getById before all three signals are ready sends
  // it as `anon`, which a private study_media row refuses with 42501 —
  // rendering a real record as a permanent "Something went wrong" on first
  // load. See features/education/media/authLoad.ts.
  const authReady = useStudyMediaAuthReady();
  const getWriteHandlers = () => ({ ...collectionWriteHandlers({
    plural: "memory_aids", singular: "memory aid",
    create: {
      parse: parseCreateMemoryAids,
      run: async (aid) => {
        const result = await studyMediaService.create({ mediaKind: "memory_aid", title: aid.title,
          irEnvelope: aid, status: "ready" });
        if (result.error || !result.data) throw new Error(result.error ?? "Could not create memory aid.");
        return { id: result.data.id, name: result.data.title };
      }, nameOf: (aid) => aid.title,
    },
    update: {
      parse: (value) => { if (editingItem) throw new Error("Finish or cancel the open item edit before applying agent changes."); return parseUpdateMemoryAids(value, canEdit && media ? [media] : []); },
      run: async (plan) => {
        const result = await studyMediaService.updateVersioned(plan.id, plan.version, { title: plan.aid.title, ir_envelope: plan.aid });
        if (result.error || !result.data) throw new Error(result.error ?? "Could not update memory aid.");
        setMedia(result.data);
        return { id: result.data.id, name: result.data.title };
      }, nameOf: (plan) => plan.aid.title, changedOf: (plan) => plan.changed,
    },
    delete: {
      parse: (value) => { if (editingItem) throw new Error("Finish or cancel the open item edit before deleting this set."); return parseMemoryIds(value, "delete_memory_aids", isOwner && media ? [media] : []).map(() => {
        if (!media) throw new Error("The memory aid is no longer available.");
        return media;
      }); },
      run: async (row) => {
        const result = await studyMediaService.softDelete(row.id);
        if (result.error) throw new Error(result.error);
        router.push("/education/memory");
        return { id: row.id, name: row.title };
      }, nameOf: (row) => row.title,
    },
  }, refuseSurfaceWrite),
    change_memory_item: {
      validate: (value: unknown) => {
        if (editingItem) throw new Error("Finish or cancel the open item edit before applying agent changes.");
        const current = media ? coerceMemoryAid(media.ir_envelope) : null;
        if (!canEdit || !current) throw new Error("Open a memory aid you can edit before changing one item.");
        parseMemoryItemChange(value, current, media?.version);
      },
      apply: async (value: unknown) => {
        if (editingItem) throw new Error("Finish or cancel the open item edit before applying agent changes.");
        const current = media ? coerceMemoryAid(media.ir_envelope) : null;
        if (!canEdit || !media || !current) throw new Error("The editable memory aid is no longer available.");
        const change = parseMemoryItemChange(value, current, media?.version);
        const result = await studyMediaService.updateVersioned(media.id, media.version, { title: change.aid.title, ir_envelope: change.aid });
        if (result.error || !result.data) throw new Error(result.error ?? "Could not change memory item.");
        setMedia(result.data);
        return { summary: change.summary, data: { id: result.data.id, version: result.data.version } };
      },
    },
  });

  // Read at trigger time, never from stale closure state. `/[id]/edit` renders
  // this same component behind a requireAccess gate and reports `detail`.
  const buildScope = () => {
    const aid = media ? coerceMemoryAid(media.ir_envelope) : null;
    const aidTrust = media ? coerceTrustEnvelope({ trust: media.trust }) : null;
    return createEducationMemoryScope({
      view: "detail",
      aid_id: mediaId,
      aid_version: media?.version,
      aid_loaded: !loading && !!media,
      aid_is_owner: isOwner,
      ...(media
        ? {
            aid_title: media.title,
            ...(media.source_kind ? { aid_source_kind: media.source_kind } : {}),
            ...(media.source_title
              ? { aid_source_title: media.source_title }
              : {}),
            ...(media.source_id ? { aid_source_id: media.source_id } : {}),
          }
        : {}),
      ...(aid
        ? {
            ...(aid.strategy_note ? { aid_strategy_note: aid.strategy_note } : {}),
            mnemonics: aid.mnemonics,
            analogies: aid.analogies,
            memory_palace: aid.memory_palace as unknown as Record<
              string,
              unknown
            >,
            aid_content: aid as unknown as Record<string, unknown>,
          }
        : {}),
      ...(aidTrust
        ? {
            aid_confidence: aidTrust.confidence,
            aid_citations: aidTrust.citations,
          }
        : {}),
    });
  };

  useEffect(() => {
    if (!authReady) return undefined;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      studyMediaService.getById(mediaId).then((res) => {
        if (!active) return;
        setMedia(res.data);
        setLoadError(res.data ? null : (res.error ?? null));
        setLoading(false);
      });
    });
    return () => {
      active = false;
    };
  }, [mediaId, reloadKey, authReady]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
    if (!active) return;
    const stored = sessionStorage.getItem(`memory-item-draft:${mediaId}`);
    if (!stored) return;
    try {
      const draft = JSON.parse(stored);
      if (draft.editingItem && draft.itemDraft && typeof draft.itemBaseVersion === "number") {
        setEditingItem(draft.editingItem);
        setItemDraft(coerceMemoryAidPartial(draft.itemDraft));
        setItemBaseVersion(draft.itemBaseVersion);
        toast.info("Your unsaved memory item was restored.");
      }
    } catch { sessionStorage.removeItem(`memory-item-draft:${mediaId}`); }
    });
    return () => { active = false; };
  }, [mediaId]);

  useEffect(() => {
    if (!editingItem || !itemDraft) return;
    sessionStorage.setItem(`memory-item-draft:${mediaId}`, JSON.stringify({ editingItem, itemDraft, itemBaseVersion }));
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [mediaId, editingItem, itemDraft, itemBaseVersion]);

  async function handleDelete() {
    if (!media || !(await leaveItem())) return;
    const ok = await confirm({
      title: "Move this entire memory aid set to Trash?",
      description:
        "The whole set leaves your library and goes to Trash, where you can restore it.",
      confirmLabel: "Move set to Trash",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await studyMediaService.softDelete(media.id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Moved to Trash");
    router.push("/education/memory");
  }

  async function leaveItem() {
    if (itemSaving) return false;
    if (!editingItem) return true;
    const discard = await confirm({ title: "Discard this item edit?", description: "Your unsaved item changes will be discarded.", confirmLabel: "Discard changes", variant: "destructive" });
    if (discard) sessionStorage.removeItem(`memory-item-draft:${mediaId}`);
    return discard;
  }

  async function navigate(href: string) {
    if (await leaveItem()) router.push(href);
  }

  async function beginItem(kind: MemoryItemKind, index: number, adding = false) {
    if (!(await leaveItem())) return;
    if (!media) return;
    const base = coerceMemoryAidPartial(media.ir_envelope);
    const next = !adding ? base : kind === "mnemonic"
      ? { ...base, mnemonics: [...base.mnemonics, { __kind: "mnemonic" as const, technique: "sentence" as const, target: "", device: "", explanation: "" }] }
      : kind === "analogy"
        ? { ...base, analogies: [...base.analogies, { __kind: "analogy" as const, concept: "", analogy: "", mapping: "" }] }
        : { ...base, memory_palace: { ...base.memory_palace, applicable: true,
            loci: [...base.memory_palace.loci, { __kind: "locus" as const, place: "", item: "", image: "" }] } };
    setItemDraft(next);
    setItemBaseVersion(media.version);
    setEditingItem({ kind, index });
    setItemError(null);
  }

  async function saveItem() {
    if (!media || !itemDraft || itemBaseVersion === null) return;
    let clean: MemoryAidPayload;
    try { clean = parseMemoryAid(itemDraft, "memory aid", true); }
    catch (error) { setItemError(error instanceof Error ? error.message : "Check this item."); return; }
    setItemSaving(true);
    const result = await studyMediaService.updateVersioned(media.id, itemBaseVersion, { title: clean.title, ir_envelope: clean });
    setItemSaving(false);
    if (result.error || !result.data) { setItemError(result.error ?? "Could not save this item."); return; }
    setMedia(result.data);
    sessionStorage.removeItem(`memory-item-draft:${mediaId}`);
    setEditingItem(null);
    setItemDraft(null);
    setItemError(null);
    toast.success("Memory item saved");
  }

  async function deleteItem(kind: MemoryItemKind, index: number) {
    if (!media || !(await leaveItem())) return;
    const noun = kind === "locus" ? "palace stop" : kind;
    const ok = await confirm({ title: `Delete this ${noun}?`,
      description: "Only this item will be removed. The memory aid set will remain.",
      confirmLabel: `Delete ${noun}`, variant: "destructive" });
    if (!ok) return;
    const next = removeMemoryItem(coerceMemoryAidPartial(media.ir_envelope), kind, index);
    const clean = parseMemoryAid(next, "memory aid", true);
    const result = await studyMediaService.updateVersioned(media.id, media.version, { title: clean.title, ir_envelope: clean });
    if (result.error || !result.data) { toast.error(result.error ?? `Could not delete ${noun}.`); return; }
    setMedia(result.data);
    sessionStorage.removeItem(`memory-item-draft:${mediaId}`);
    setEditingItem(null);
    setItemDraft(null);
    toast.success(`${noun[0].toUpperCase()}${noun.slice(1)} deleted`);
  }

  // The runtime is mounted on EVERY branch, including loading and not-found —
  // `aid_loaded: false` is a declared, honest value, and an agent launched
  // mid-load should still resolve this surface rather than fall back to the
  // empty-scope path.
  if (loading) {
    return (
      <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={buildScope} getWriteHandlers={getWriteHandlers}>
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </SurfaceRuntimeProvider>
    );
  }

  if (!media) {
    return (
      <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={buildScope} getWriteHandlers={getWriteHandlers}>
        {/* Denied / deleted / never existed / signed-out all read as zero rows here. */}
        <AccessGate
          token="study_media"
          id={mediaId}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          fallbackHref="/education/memory"
          fallbackLabel="Memory Aids"
        />
      </SurfaceRuntimeProvider>
    );
  }

  const trust = coerceTrustEnvelope({ trust: media.trust });

  if (edit) return <MemoryEditor media={media} isOwner={isOwner} />;

  return (
    <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={buildScope} getWriteHandlers={getWriteHandlers}>
    <div className="matrx-touch-targets mx-auto w-full max-w-2xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => void navigate("/education/memory")}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1
            className="truncate text-lg font-semibold text-foreground"
            data-surface-value="aid_title"
          >
            {media.title}
          </h1>
        </div>
        <div className={findOpen ? "flex w-full min-w-0 justify-end sm:w-auto" : "flex shrink-0 items-center gap-1"}>
          <ContentFindControl rootRef={contentRef} label="Find in memory aids" inline onOpenChange={setFindOpen} />
          {!findOpen && canEdit && <>
            <Button variant="outline" size="sm" onClick={() => void navigate(`/education/memory/${media.id}/edit`)}>
              <Pencil className="mr-1 h-4 w-4" /> Edit all
            </Button>
            {isOwner && <>
            <ShareButton
              resourceType="study_media"
              resourceId={media.id}
              resourceName={media.title}
              isOwner
              size="sm"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More memory aid actions"><Ellipsis className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void navigate(media.source_kind === "topic" ? "/education/memory/new?source=topic" : `/education/memory/new?source=deck&deck=${media.source_id ?? ""}`)}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Regenerate set
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void handleDelete()}>
                  <Trash2 className="mr-2 h-4 w-4" /> Move set to Trash
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>}
          </>}
        </div>
      </div>

      <div ref={contentRef} data-surface-value="aid_content">
        {/* THE CANONICAL COMPONENT LAW: the registered `memory_aid` kind renders
            through its ONE kind component — the same pixels as the live run
            window and chat. */}
        <MemoryAidBlock serverData={editingItem && itemDraft ? itemDraft : media.ir_envelope} controls={canEdit ? {
          onAdd: (kind) => {
            const current = coerceMemoryAidPartial(media.ir_envelope);
            void beginItem(kind, kind === "mnemonic" ? current.mnemonics.length : kind === "analogy" ? current.analogies.length : current.memory_palace.loci.length, true);
          },
          onEdit: (kind, index) => void beginItem(kind, index),
          onDelete: (kind, index) => void deleteItem(kind, index),
          ...(editingItem && itemDraft ? { editor: { ...editingItem,
            content: <MemoryItemEditor aid={itemDraft} kind={editingItem.kind} index={editingItem.index}
              onChange={setItemDraft} onSave={() => void saveItem()} onCancel={() => { sessionStorage.removeItem(`memory-item-draft:${mediaId}`); setEditingItem(null); setItemDraft(null); setItemError(null); }}
              saving={itemSaving} error={itemError} /> } } : {}),
        } : undefined} />
      </div>

      {/* Where this came from + the rest of the kit made from the same upload. */}
      <MadeFromSource entityType="study_media" entityId={media.id} />

      {trust && (
        <div
          className="space-y-2 rounded-xl border border-border bg-card/60 p-4"
          data-surface-value="aid_citations"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              Grounded in
            </span>
            <ConfidenceBadge confidence={trust.confidence} />
          </div>
          <SourceCitations trust={trust} />
        </div>
      )}
    </div>
    </SurfaceRuntimeProvider>
  );
}
