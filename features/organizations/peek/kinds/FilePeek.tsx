"use client";

/**
 * FilePeek — canonical "data-driven" peek example.
 *
 * Pattern (copy this for new kinds):
 *   1. fetch the one row by id from the kind's table
 *   2. drop fields into <PeekDialog> + <PeekField>
 *   3. set href to the kind's detail route
 *
 * TODO(file-peek-media): for image/pdf mimes, render an inline preview through
 * the universal file handler (features/files) instead of metadata-only.
 */

import React from "react";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/utils/supabase/client";
import { filesDb } from "@/features/files/filesDb";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface FileRow {
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string | null;
}

function humanSize(bytes: number | null): string {
  if (!bytes && bytes !== 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function FilePeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<FileRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await filesDb(supabase)
        .from("files")
        .select("file_name, mime_type, size_bytes, created_at")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as FileRow) ?? null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <PeekDialog
      open={open}
      onClose={onClose}
      title={row?.file_name ?? "File"}
      icon={<FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
      href={`/files/f/${id}`}
      loading={loading}
    >
      {row ? (
        <>
          <PeekField label="Type">
            <Badge variant="secondary" className="text-xs font-mono">
              {row.mime_type ?? "unknown"}
            </Badge>
          </PeekField>
          <PeekField label="Size">{humanSize(row.size_bytes)}</PeekField>
          <PeekField label="Added">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">File not found.</p>
      )}
    </PeekDialog>
  );
}
