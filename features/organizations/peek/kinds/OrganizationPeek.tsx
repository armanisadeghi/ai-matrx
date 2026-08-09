"use client";

/**
 * OrganizationPeek — quick read-only preview of an organization.
 *
 * Same pattern as FilePeek / NotePeek: fetch the row, fill <PeekDialog>.
 * The door comes from the entity registry (`/organizations/<id>`) — never
 * hard-code the route here.
 *
 * Orgs are named constantly in the admin consoles (exposure audit, accounts,
 * activity log, sharing), where the reader's question is "wait, which org is
 * that?" — exactly what a peek answers without losing their place.
 */

import React from "react";
import { Building2 } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

interface OrganizationRow {
  name: string | null;
  slug: string | null;
  description: string | null;
  created_at: string | null;
}

export default function OrganizationPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<OrganizationRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .schema("iam")
        .from("organizations")
        .select("name, slug, description, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow((data as OrganizationRow) ?? null);
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
      title={row?.name || "Organization"}
      icon={
        <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
      }
      token="organization"
      id={id}
      loading={loading}
    >
      {row ? (
        <>
          {row.slug ? (
            <PeekField label="Slug">
              <span className="font-mono text-xs text-muted-foreground">
                {row.slug}
              </span>
            </PeekField>
          ) : null}
          <PeekField label="Description">
            {row.description ? (
              <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                {row.description}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </PeekField>
          {row.created_at ? (
            <PeekField label="Created">
              <span className="text-sm text-muted-foreground">
                {new Date(row.created_at).toLocaleString()}
              </span>
            </PeekField>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          This organization isn&apos;t available — it may have been deleted, or
          you may not have access to it.
        </p>
      )}
    </PeekDialog>
  );
}
