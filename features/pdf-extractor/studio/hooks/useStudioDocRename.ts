"use client";

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useToastManager } from "@/hooks/useToastManager";
import type { PdfDocument } from "../../hooks/usePdfExtractor";
import type { StudioDocSummary } from "./usePdfStudioDocs";
import { renameStudioDocument } from "../renameStudioDocument";

interface UseStudioDocRenameOptions {
  docs: StudioDocSummary[];
  setDocName: (docId: string, name: string) => void;
  refresh: () => void;
  activeDoc: PdfDocument | null;
  setActiveDoc: Dispatch<SetStateAction<PdfDocument | null>>;
}

export function useStudioDocRename({
  docs,
  setDocName,
  refresh,
  activeDoc,
  setActiveDoc,
}: UseStudioDocRenameOptions) {
  const dispatch = useAppDispatch();
  const toast = useToastManager("pdf-extractor");

  const renameDocById = useCallback(
    async (docId: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;

      const summary =
        docs.find((d) => d.id === docId) ??
        (activeDoc?.id === docId ? activeDoc : null);
      if (!summary || trimmed === summary.name) return;

      const previousName = summary.name;
      if (activeDoc?.id === docId) {
        setActiveDoc((d) => (d ? { ...d, name: trimmed } : d));
      }
      setDocName(docId, trimmed);

      try {
        await renameStudioDocument({
          docId,
          sourceKind: summary.sourceKind,
          sourceId: summary.sourceId,
          newName: trimmed,
          dispatch,
        });
        refresh();
      } catch (err) {
        if (activeDoc?.id === docId) {
          setActiveDoc((d) => (d ? { ...d, name: previousName } : d));
        }
        setDocName(docId, previousName);
        toast.error(err instanceof Error ? err.message : "Rename failed");
        throw err;
      }
    },
    [docs, activeDoc, setActiveDoc, setDocName, refresh, dispatch, toast],
  );

  const handleRenameActiveDoc = useCallback(
    async (newName: string) => {
      if (!activeDoc) return;
      await renameDocById(activeDoc.id, newName);
    },
    [activeDoc, renameDocById],
  );

  return { renameDocById, handleRenameActiveDoc };
}
