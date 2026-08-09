"use client";

/**
 * RegistryPeek — the peek every registered entity gets for free.
 *
 * THE DOOR LAW's third door is Peek: "whenever the user's next question is
 * 'wait, which one is that?'". Hand-written peeks answer that for 20 kinds and
 * left ~40 registered tokens with nothing — so an attached `crm_campaign`,
 * `seo_keyword`, `folder`, `code_repository` or `working_document` rendered as
 * plain text with no way to find out what it was. Writing 40 near-identical
 * fetch-and-show components would have been the wrong fix (and the exact
 * duplication PRINCIPLES.md bans).
 *
 * Instead this reads the ENTITY REGISTRY — schema, table, title column, icon,
 * label all come from `platform.entity_types` via `getEntityInfo` — and shows
 * the record. Registering a new entity therefore gives it a preview with no
 * frontend work at all.
 *
 * A BESPOKE peek always wins (`PEEK_REGISTRY` is checked first): this is the
 * floor, not a replacement. Write a real one whenever the kind deserves more
 * than title/description/dates — a file wants its thumbnail, an agent its
 * model.
 *
 * It reads `select("*")` deliberately: column sets vary per table and a peek is
 * a single row, so the alternative is a per-token column map that would drift.
 * A schema PostgREST doesn't expose (`rag`) simply fails the read and says so —
 * never a blank dialog pretending the record is empty.
 */

import React from "react";
import { Boxes } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { PeekDialog, PeekField } from "../PeekDialog";
import type { PeekProps } from "../types";

/** Fields worth showing under the title, in the order a reader wants them. */
const DETAIL_FIELDS = [
  "description",
  "summary",
  "tagline",
  "status",
  "visibility",
  "category",
] as const;

const DATE_FIELDS = ["updated_at", "created_at"] as const;

type Row = Record<string, unknown>;

function asText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export function RegistryPeek({
  token,
  id,
  open,
  onClose,
}: PeekProps & { token: string }) {
  const info = tryGetEntityInfo(token);
  const [row, setRow] = React.useState<Row | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!info) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      // Same dynamic-read shape as `features/scopes/service/associationCandidates.ts`:
      // supabase-js wants literal schema/table names, so narrow the runtime
      // values the registry gives us and cast the unknown row on read.
      const db = (
        info.schema && info.schema !== "public"
          ? supabase.schema(info.schema as "files")
          : supabase
      ) as typeof supabase;

      const { data, error } = await db
        .from(info.table as never)
        .select("*")
        .eq("id" as never, id as never)
        .maybeSingle();
      if (cancelled) return;
      // A read that ERRORED is not the same as a record that isn't there —
      // never report an empty preview for data we could not read.
      if (error) setFailed(true);
      setRow((data as Row | null) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [info, id]);

  const Icon = info?.Icon ?? Boxes;
  const title =
    (info?.titleColumn ? asText(row?.[info.titleColumn]) : null) ??
    info?.label ??
    "Record";

  return (
    <PeekDialog
      open={open}
      onClose={onClose}
      title={title}
      icon={<Icon className="h-4 w-4 text-muted-foreground" />}
      token={token}
      id={id}
      loading={loading}
    >
      {failed ? (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t read this {info?.label?.toLowerCase() ?? "record"} — it
          may not be readable from the browser, or you may not have access.
        </p>
      ) : row ? (
        <>
          {DETAIL_FIELDS.map((field) => {
            const value = asText(row[field]);
            return value ? (
              <PeekField key={field} label={field.replace(/_/g, " ")}>
                <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {value}
                </div>
              </PeekField>
            ) : null;
          })}
          {DATE_FIELDS.map((field) => {
            const value = asText(row[field]);
            return value ? (
              <PeekField key={field} label={field.replace(/_/g, " ")}>
                <span className="text-sm text-muted-foreground">
                  {new Date(value).toLocaleString()}
                </span>
              </PeekField>
            ) : null;
          })}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          This {info?.label?.toLowerCase() ?? "record"} isn&apos;t available — it
          may have been deleted, or it isn&apos;t shared with you.
        </p>
      )}
    </PeekDialog>
  );
}

export default RegistryPeek;
