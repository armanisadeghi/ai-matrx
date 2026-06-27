"use client";

/**
 * SkillPeek — quick read-only preview of a skill definition.
 *
 * Same pattern as FilePeek / NotePeek: fetch one row from skill.definition,
 * drop fields into <PeekDialog> + <PeekField>.
 */

import React from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface SkillRow {
  label: string | null;
  description: string | null;
  created_at: string | null;
}

export default function SkillPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<SkillRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .schema("skill")
        .from("definition")
        .select("label, description, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as SkillRow) ?? null);
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
      title={row?.label || "Skill"}
      icon={<Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
      href={`/skills/${id}`}
      loading={loading}
    >
      {row ? (
        <>
          <PeekField label="Description">
            {row.description ? (
              <div className="text-sm whitespace-pre-wrap break-words text-muted-foreground rounded-md border border-border bg-muted/20 p-3 max-h-72 overflow-y-auto">
                {row.description}
              </div>
            ) : (
              <span className="text-muted-foreground italic">No description</span>
            )}
          </PeekField>
          <PeekField label="Added">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
          </PeekField>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Skill not found.</p>
      )}
    </PeekDialog>
  );
}
