"use client";

import { useEffect, useState } from "react";
import {
  getFileResourceFamily,
  type FileResourceFamilyInventory,
} from "../api/resource-family";

interface FileResourceFamilyState {
  data: FileResourceFamilyInventory | null;
  loading: boolean;
  error: string | null;
}

interface StoredFileResourceFamilyState {
  fileId: string | null;
  data: FileResourceFamilyInventory | null;
  error: string | null;
}

export function useFileResourceFamily(fileId: string | null): FileResourceFamilyState {
  const [state, setState] = useState<StoredFileResourceFamilyState>({
    fileId: null,
    data: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    if (!fileId) {
      return () => {
        active = false;
      };
    }
    void getFileResourceFamily(fileId)
      .then((data) => {
        if (active) setState({ fileId, data, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          fileId,
          data: null,
          error: error instanceof Error ? error.message : "Unable to load file family",
        });
      });
    return () => {
      active = false;
    };
  }, [fileId]);

  if (!fileId) return { data: null, loading: false, error: null };
  if (state.fileId !== fileId) return { data: null, loading: true, error: null };
  return { data: state.data, loading: false, error: state.error };
}
