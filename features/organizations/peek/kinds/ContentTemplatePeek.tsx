"use client";

/**
 * ContentTemplatePeek — quick read-only preview for a content_template row.
 *
 * Same pattern as FilePeek: fetch the row by id, fill <PeekDialog>.
 * The content_template table uses "label" as its title column.
 */

import React from "react";
import { LayoutTemplate } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface ContentTemplateRow {
  label: string | null;
  created_at: string | null;
}

export default function ContentTemplatePeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<ContentTemplateRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("content_template")
        .select("label, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as ContentTemplateRow) ?? null);
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
      title={row?.label || "Content Template"}
      icon={<LayoutTemplate className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
      href={`/settings/content-templates/${id}`}
      loading={loading}
    >
      {row ? (
        <>
          <PeekField label="Created">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Content template not found.</p>
      )}
    </PeekDialog>
  );
}
