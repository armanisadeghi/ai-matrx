"use client";

// features/bindings/ArchivedHolderNotice.tsx
//
// The chosen Mandate Holder is archived → ONE honest action (rule in
// ./archived-holder.ts): "Restore and use" when this person may restore it,
// otherwise "Archived — ask the owner to restore it" with the request-access
// primitive. Renders nothing for a live holder.
//
// Restoring goes through each kind's own write door — `saveAgentField` for an
// agent, `setWorkflowFlag` for a workflow — as the person (RLS decides; a
// refused write says so). Then the host's `onUseRestored` binds it.

import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RequestAccess } from "@/features/access-gate/components/RequestAccess";
import { saveAgentField } from "@/features/agents/redux/agent-definition/thunks";
import { setWorkflowFlag } from "@/features/workflow-runtime/browse/service";
import { useAppDispatch } from "@/lib/redux/hooks";
import { canActOn } from "@/features/access-gate/service/canActOn";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import {
  archivedHolderOffer,
  type ArchivedHolderFacts,
  type HolderKind,
} from "./archived-holder";

async function readFacts(kind: HolderKind, id: string): Promise<ArchivedHolderFacts | null> {
  const query =
    kind === "agent"
      ? supabase.schema("agent").from("definition")
      : supabase.schema("workflow").from("definition");
  const { data, error } = await query
    .select("id, name, is_archived, organization_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    id: string;
    name: string | null;
    is_archived: boolean | null;
    organization_id: string | null;
  };
  const base = { kind, id, name: row.name, organizationId: row.organization_id };
  if (!row.is_archived) return { ...base, isArchived: false, viewerCanEdit: false };
  return { ...base, isArchived: true, viewerCanEdit: await canActOn(kind, id, "editor") };
}

export function ArchivedHolderNotice({
  kind,
  holderId,
  onUseRestored,
  disabled = false,
}: {
  kind: HolderKind;
  holderId: string | null;
  /** After a successful restore: bind it (the host's save). */
  onUseRestored?: (() => void) | null;
  disabled?: boolean;
}) {
  const dispatch = useAppDispatch();
  const [facts, setFacts] = useState<{ key: string; value: ArchivedHolderFacts | null } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const key = `${kind}:${holderId ?? ""}`;

  useEffect(() => {
    if (!holderId) return undefined;
    let live = true;
    void readFacts(kind, holderId).then((value) => {
      if (live) setFacts({ key, value });
    });
    return () => {
      live = false;
    };
  }, [kind, holderId, key]);

  const current = facts?.key === key ? facts.value : null;
  const offer = archivedHolderOffer(current);
  if (!holderId || offer.kind === "none") return null;

  const restore = async () => {
    setRestoring(true);
    try {
      if (kind === "agent") {
        await dispatch(
          saveAgentField({ agentId: holderId, field: "isArchived", value: false as never }),
        ).unwrap();
      } else {
        await setWorkflowFlag(holderId, { is_archived: false });
      }
      setFacts({ key, value: current ? { ...current, isArchived: false } : null });
      toast.success(`${current?.name ?? "It"} is restored.`);
      onUseRestored?.();
    } catch (error: unknown) {
      toast.error(
        `Could not restore it: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div
      data-testid="archived-holder-notice"
      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[12px] text-foreground"
    >
      <Archive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span>{offer.sentence}</span>
      {offer.kind === "restore" ? (
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          disabled={disabled || restoring}
          onClick={() => void restore()}
        >
          {restoring ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
          )}
          {offer.label}
        </Button>
      ) : (
        <RequestAccess target={offer.target} variant="icon" />
      )}
    </div>
  );
}
