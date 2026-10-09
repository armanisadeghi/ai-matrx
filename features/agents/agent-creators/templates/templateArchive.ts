"use client";

// features/agents/agent-creators/templates/templateArchive.ts
//
// ARCHIVE AND RESTORE FOR AN AGENT TEMPLATE ("delete means archive everywhere").
//
// Same pattern as agents: the archive flag (`agent.template.is_archived`) is flipped, nothing is
// destroyed, and the archived-items filter on the templates page (ArchivedDisclosure) is the way
// back. Who may do it is NOT decided here: row security on `agent.template` (creator, editor
// grant, or platform admin) answers the write, and `useTemplateEditAccess` asks the same three
// questions up front so a person who may not archive never sees a dead control.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { tryWriteOne } from "@/utils/supabase/writeOne";

export interface TemplateArchiveConfirmCopy {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
}

/** The confirm a person reads before archiving a template: names what leaves, what stays, the way back. */
export function buildTemplateArchiveConfirm(templateName?: string | null): TemplateArchiveConfirmCopy {
  const trimmed = (templateName ?? "").trim();
  const quoted = trimmed ? `"${trimmed}"` : "this template";
  return {
    title: `Archive ${quoted}?`,
    description:
      `${trimmed ? quoted : "This template"} leaves the template list. ` +
      `Agents already made from it are not affected. ` +
      `Nothing is deleted: show archived templates on this page and restore it any time.`,
    confirmLabel: "Archive it",
    cancelLabel: "Keep it",
  };
}

/** Flip the archive flag. Throws a plain sentence when the write did not land (not yours to change). */
export async function setTemplateArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await tryWriteOne(
    supabase
      .schema("agent")
      .from("template")
      .update({ is_archived: archived })
      .eq("id", id)
      .select("id"),
    { action: archived ? "archive" : "restore", noun: "template" },
  );
  if (error) throw error instanceof Error ? error : new Error(String((error as { message?: string }).message ?? error));
}

interface EditCheckRow {
  id: string;
  created_by?: string | null;
}

/**
 * The ids this person may archive: the same rule row security enforces on update —
 * platform admin, the creator, or an editor grant (`iam.has_access(.., 'editor')`).
 */
export function useTemplateEditAccess(rows: EditCheckRow[]): Set<string> {
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const key = useMemo(() => rows.map((r) => `${r.id}:${r.created_by ?? ""}`).join("|"), [rows]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [{ data: auth }, admin] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("is_platform_admin"),
      ]);
      const uid = auth.user?.id ?? null;
      if (admin.data === true) {
        if (live) setAllowed(new Set(rows.map((r) => r.id)));
        return;
      }
      const iam = supabase.schema("iam" as never) as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }>;
      };
      const mine = rows.filter((r) => uid && r.created_by === uid).map((r) => r.id);
      const others = rows.filter((r) => !(uid && r.created_by === uid));
      const granted = await Promise.all(
        others.map(async (r) => {
          const { data } = await iam.rpc("has_access", { p_type: "agent_template", p_id: r.id, p_required: "editor" });
          return data === true ? r.id : null;
        }),
      );
      if (live) setAllowed(new Set([...mine, ...granted.filter((x): x is string => x !== null)]));
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return allowed;
}
