"use client";

/**
 * usePipelineItem — the pipeline workspace's data engine for ONE item:
 * the item row, its payloads (analysis/research/grading/listing), questions,
 * and files, plus every mutation the stage panels need. Payload edits
 * autosave (debounced, guarded CAS) — no save button anywhere.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "@/lib/toast";

import type { CaptureFile } from "../../types";
import { listItemFiles, setItemCode, setItemNotes } from "../../service";
import type {
  PayloadDataByKind,
  PayloadKind,
  PipelinePayload,
  PipelineStage,
} from "../../pipeline-types";
import {
  answerQuestion,
  createQuestion,
  deferQuestion,
  listItemQuestions,
  listPayloads,
  loadPipelineItem,
  reopenQuestion,
  savePayload,
  setFeaturedFile,
  setItemStage,
  splitItem,
  type PipelineItem,
  type PipelineQuestion,
  type SplitGroupInput,
} from "../../pipeline-service";

const PAYLOAD_AUTOSAVE_MS = 1000;

export interface UsePipelineItemResult {
  item: PipelineItem | null;
  notFound: boolean;
  files: CaptureFile[];
  payloads: Partial<Record<PayloadKind, PipelinePayload>>;
  questions: PipelineQuestion[];
  saving: boolean;

  reload: () => Promise<void>;
  moveToStage: (stage: PipelineStage) => Promise<void>;
  setFeatured: (fileId: string | null) => Promise<void>;
  saveCode: (code: string) => Promise<void>;
  saveNotes: (notes: string) => Promise<void>;
  /** Merge a partial edit into a payload document (debounced autosave). */
  editPayload: <K extends PayloadKind>(
    kind: K,
    patch: Partial<PayloadDataByKind[K]>,
  ) => void;
  addQuestion: (prompt: string, context?: string) => Promise<void>;
  answer: (q: PipelineQuestion, answer: string) => Promise<void>;
  defer: (q: PipelineQuestion, reason?: string) => Promise<void>;
  reopen: (q: PipelineQuestion) => Promise<void>;
  split: (groups: SplitGroupInput[]) => Promise<void>;
}

export function usePipelineItem(itemId: string | null): UsePipelineItemResult {
  const [item, setItem] = useState<PipelineItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [files, setFiles] = useState<CaptureFile[]>([]);
  const [payloads, setPayloads] = useState<
    Partial<Record<PayloadKind, PipelinePayload>>
  >({});
  const [questions, setQuestions] = useState<PipelineQuestion[]>([]);
  const [saving, setSaving] = useState(false);

  const itemRef = useRef<PipelineItem | null>(null);
  const payloadsRef = useRef(payloads);
  const pendingEditsRef = useRef(
    new Map<PayloadKind, Record<string, unknown>>(),
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const adopt = useCallback((next: PipelineItem | null) => {
    itemRef.current = next;
    setItem(next);
  }, []);

  const reload = useCallback(async () => {
    if (!itemId) return;
    try {
      const loaded = await loadPipelineItem(itemId);
      if (!loaded) {
        setNotFound(true);
        adopt(null);
        return;
      }
      setNotFound(false);
      adopt(loaded);
      const [loadedFiles, loadedPayloads, loadedQuestions] = await Promise.all([
        listItemFiles(itemId),
        listPayloads(itemId),
        listItemQuestions(itemId),
      ]);
      setFiles(loadedFiles);
      payloadsRef.current = loadedPayloads;
      setPayloads(loadedPayloads);
      setQuestions(loadedQuestions);
    } catch (err) {
      console.error("[product-pipeline] item load failed", err);
      toast.error("Could not load the item.");
    }
  }, [itemId, adopt]);

  // Reset + load on item switch, deferred a tick (no sync setState in the
  // effect body — the reset and the fresh read land together).
  useEffect(() => {
    pendingEditsRef.current.clear();
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const timer = setTimeout(() => {
      adopt(null);
      setNotFound(false);
      setFiles([]);
      payloadsRef.current = {};
      setPayloads({});
      setQuestions([]);
      if (itemId) void reload();
    }, 0);
    return () => clearTimeout(timer);
  }, [itemId, reload, adopt]);

  // ── Payload autosave ─────────────────────────────────────────────────────

  const flushPayloads = useCallback(async () => {
    const current = itemRef.current;
    if (!current || pendingEditsRef.current.size === 0) return;
    const edits = new Map(pendingEditsRef.current);
    pendingEditsRef.current.clear();
    setSaving(true);
    try {
      for (const [kind, data] of edits) {
        const existing = payloadsRef.current[kind];
        const saved = await savePayload(
          current,
          kind,
          data as never,
          existing as never,
        );
        payloadsRef.current = { ...payloadsRef.current, [kind]: saved };
      }
      setPayloads(payloadsRef.current);
    } catch (err) {
      console.error("[product-pipeline] payload save failed", err);
      toast.error("Changes could not be saved — check your connection.");
      // Re-queue so the next edit retries the write.
      for (const [kind, data] of edits) {
        if (!pendingEditsRef.current.has(kind)) {
          pendingEditsRef.current.set(kind, data);
        }
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const editPayload = useCallback(
    <K extends PayloadKind>(
      kind: K,
      patch: Partial<PayloadDataByKind[K]>,
    ) => {
      const base =
        pendingEditsRef.current.get(kind) ??
        (payloadsRef.current[kind]?.data as Record<string, unknown>) ??
        {};
      const next = { ...base, ...patch };
      pendingEditsRef.current.set(kind, next);
      // Optimistic local view so the panels render the edit immediately.
      const existing = payloadsRef.current[kind];
      payloadsRef.current = {
        ...payloadsRef.current,
        [kind]: {
          id: existing?.id ?? "",
          itemId: itemRef.current?.id ?? "",
          kind,
          data: next,
          updatedAt: existing?.updatedAt ?? new Date().toISOString(),
          version: existing?.version ?? 0,
        } as PipelinePayload,
      };
      setPayloads(payloadsRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(
        () => void flushPayloads(),
        PAYLOAD_AUTOSAVE_MS,
      );
    },
    [flushPayloads],
  );

  // Flush pending edits when the tab hides or the hook unmounts.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushPayloads();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void flushPayloads();
    };
  }, [flushPayloads]);

  // ── Item mutations ───────────────────────────────────────────────────────

  const moveToStage = useCallback(
    async (stage: PipelineStage) => {
      const current = itemRef.current;
      if (!current) return;
      await flushPayloads();
      try {
        adopt(await setItemStage(current, stage));
      } catch (err) {
        console.error("[product-pipeline] stage change failed", err);
        toast.error("Could not move the item.");
      }
    },
    [adopt, flushPayloads],
  );

  const setFeatured = useCallback(
    async (fileId: string | null) => {
      const current = itemRef.current;
      if (!current) return;
      try {
        adopt(await setFeaturedFile(current, fileId));
      } catch (err) {
        console.error("[product-pipeline] featured image failed", err);
        toast.error("Could not set the featured image.");
      }
    },
    [adopt],
  );

  const saveCode = useCallback(
    async (code: string) => {
      const current = itemRef.current;
      if (!current) return;
      try {
        const saved = await setItemCode(current, code, "manual");
        adopt({ ...current, ...saved });
      } catch (err) {
        console.error("[product-pipeline] code save failed", err);
        toast.error("Could not save the product number.");
      }
    },
    [adopt],
  );

  const saveNotes = useCallback(
    async (notes: string) => {
      const current = itemRef.current;
      if (!current) return;
      try {
        const saved = await setItemNotes(current, notes);
        adopt({ ...current, ...saved });
      } catch (err) {
        console.error("[product-pipeline] notes save failed", err);
        toast.error("Could not save the notes.");
      }
    },
    [adopt],
  );

  // ── Questions ────────────────────────────────────────────────────────────

  const patchQuestion = useCallback((saved: PipelineQuestion) => {
    setQuestions((prev) => prev.map((q) => (q.id === saved.id ? saved : q)));
  }, []);

  const addQuestion = useCallback(
    async (prompt: string, context?: string) => {
      const current = itemRef.current;
      if (!current) return;
      try {
        const created = await createQuestion({ item: current, prompt, context });
        setQuestions((prev) => [...prev, created]);
      } catch (err) {
        console.error("[product-pipeline] question create failed", err);
        toast.error("Could not add the question.");
      }
    },
    [],
  );

  const answer = useCallback(
    async (q: PipelineQuestion, value: string) => {
      try {
        patchQuestion(await answerQuestion(q, value));
      } catch (err) {
        console.error("[product-pipeline] answer failed", err);
        toast.error("Could not save the answer.");
      }
    },
    [patchQuestion],
  );

  const defer = useCallback(
    async (q: PipelineQuestion, reason?: string) => {
      try {
        patchQuestion(await deferQuestion(q, reason));
      } catch (err) {
        console.error("[product-pipeline] defer failed", err);
        toast.error("Could not defer the question.");
      }
    },
    [patchQuestion],
  );

  const reopen = useCallback(
    async (q: PipelineQuestion) => {
      try {
        patchQuestion(await reopenQuestion(q));
      } catch (err) {
        console.error("[product-pipeline] reopen failed", err);
        toast.error("Could not reopen the question.");
      }
    },
    [patchQuestion],
  );

  const split = useCallback(
    async (groups: SplitGroupInput[]) => {
      const current = itemRef.current;
      if (!current) return;
      try {
        const { created } = await splitItem(current, groups);
        toast.success(
          `Split into ${created.length + 1} items — each re-queued for analysis.`,
        );
        await reload();
      } catch (err) {
        console.error("[product-pipeline] split failed", err);
        toast.error("Could not split the item.");
      }
    },
    [reload],
  );

  return {
    item,
    notFound,
    files,
    payloads,
    questions,
    saving,
    reload,
    moveToStage,
    setFeatured,
    saveCode,
    saveNotes,
    editPayload,
    addQuestion,
    answer,
    defer,
    reopen,
    split,
  };
}
