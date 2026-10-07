"use client";

// features/applets/hooks/useSourceTableNames.ts — the real table behind each Applet source, in words.
//
// An Applet's sources are stored as `{ alias, table_id, organization_id }`; the alias ("books") is the
// code's name for it, never what a person reads. This reads the tables she can see once
// (`custom.data_home_tables`, every organization — a read is never narrowed to the active one) and
// answers each table id with its name and organization, so a screen says "Untitled database · Oak & River".

import { useEffect, useState } from "react";

import { createClient } from "@/utils/supabase/client";

export interface SourceTableName {
  name: string;
  organizationName: string | null;
  organizationId: string | null;
}

export function useSourceTableNames(tableIds: readonly string[]): Record<string, SourceTableName> {
  const [names, setNames] = useState<Record<string, SourceTableName>>({});
  const key = [...new Set(tableIds)].sort().join(",");
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void createClient()
      .schema("custom")
      .rpc("data_home_tables", {})
      .then(({ data, error }) => {
        if (cancelled || error || !Array.isArray(data)) return;
        const wanted = new Set(key.split(","));
        const out: Record<string, SourceTableName> = {};
        for (const row of data) {
          if (!row.table_id || !wanted.has(row.table_id)) continue;
          out[row.table_id] = { name: row.table_name || "Untitled table", organizationName: row.organization_name || null, organizationId: row.organization_id || null };
        }
        setNames(out);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return names;
}
