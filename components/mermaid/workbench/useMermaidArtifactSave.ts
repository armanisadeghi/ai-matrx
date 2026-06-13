"use client";

/**
 * Session-versioning save path (the scribe pattern, applied to artifacts):
 *  - 800ms debounced autosave + flush on unmount/explicit save;
 *  - the FIRST dirty save of a workbench session creates ONE new version row
 *    (cx_canvas_save_user_version), or a brand-new manual row when the
 *    diagram was never persisted;
 *  - subsequent autosaves in the same session update that row in place —
 *    history stays meaningful ("one session = one version").
 *
 * After every persist: invalidate the module cache and broadcast
 * CANVAS_ITEM_UPDATED_EVENT so chat refs and other views refresh live.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  CANVAS_ITEM_UPDATED_EVENT,
  invalidateCanvasItemCache,
} from "@/features/canvas/hooks/useCanvasItem";
import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import { canvasItemsService } from "@/features/canvas/services/canvasItemsService";

import type { MermaidArtifactMetadata } from "../types";

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

const AUTOSAVE_MS = 800;

interface UseMermaidArtifactSaveArgs {
  /** Existing canvas_items row id (any version in the chain); undefined for fresh diagrams. */
  canvasItemId?: string;
  title: string;
  metadata: MermaidArtifactMetadata;
  /** Conversation linkage for fresh user-created diagrams. */
  conversationId?: string;
}

export function useMermaidArtifactSave(args: UseMermaidArtifactSaveArgs) {
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);

  const argsRef = useRef(args);
  useEffect(() => {
    argsRef.current = args;
  });
  const pendingRef = useRef<{ source: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const activeVersionIdRef = useRef<string | null>(null);
  const rootIdRef = useRef<string | null>(null);

  const persist = async () => {
    const pending = pendingRef.current;
    if (!pending || savingRef.current) return;
    savingRef.current = true;
    pendingRef.current = null;
    setSaveState("saving");
    const { canvasItemId, title, metadata, conversationId } = argsRef.current;

    try {
      if (activeVersionIdRef.current) {
        // Same session — update the session's version row in place.
        const { error } = await canvasItemsService.update(activeVersionIdRef.current, {
          title,
          content: { data: pending.source, type: "mermaid", metadata },
        });
        if (error) throw error;
      } else if (canvasItemId) {
        const row = await canvasArtifactService.saveUserVersion({
          canvasId: canvasItemId,
          title,
          content: pending.source,
          type: "mermaid",
          metadata,
        });
        if (!row) throw new Error("save returned no row");
        activeVersionIdRef.current = row.id;
        rootIdRef.current = row.parent_canvas_id ?? row.id;
        setActiveVersionId(row.id);
        setVersion(row.version);
      } else {
        const row = await canvasArtifactService.createManual({
          type: "mermaid",
          title,
          content: pending.source,
          metadata,
          conversationId: conversationId ?? null,
        });
        if (!row) throw new Error("create returned no row");
        activeVersionIdRef.current = row.id;
        rootIdRef.current = row.id;
        setActiveVersionId(row.id);
        setVersion(row.version);
      }

      const rootId = rootIdRef.current ?? canvasItemId ?? activeVersionIdRef.current;
      if (rootId) invalidateCanvasItemCache(rootId);
      if (canvasItemId) invalidateCanvasItemCache(canvasItemId);
      window.dispatchEvent(
        new CustomEvent(CANVAS_ITEM_UPDATED_EVENT, {
          detail: { rootId, latestId: activeVersionIdRef.current },
        }),
      );
      setSaveState(pendingRef.current ? "dirty" : "saved");
    } catch (err) {
      console.error("[useMermaidArtifactSave] persist failed", err);
      setSaveState("error");
      toast.error("Couldn't save the diagram — your changes are still here. Retrying on next edit.");
      // Re-queue so the next edit (or flush) retries.
      pendingRef.current = pending;
    } finally {
      savingRef.current = false;
      if (pendingRef.current && !timerRef.current) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          void persist();
        }, AUTOSAVE_MS);
      }
    }
  };

  const scheduleSave = (source: string) => {
    pendingRef.current = { source };
    setSaveState("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persist();
    }, AUTOSAVE_MS);
  };

  const flush = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void persist();
  };

  // Flush on unmount so closing the canvas never loses an edit.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRef.current) void persist();
    };
  }, []);

  return { saveState, scheduleSave, flush, activeVersionId, version };
}
