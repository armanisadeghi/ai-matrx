"use client";

/**
 * SlotOverridePanel — principal picker (Me + orgs I administer) wrapped
 * around SlotOverrideEditor, for embedding a full binding editor on any
 * surface that already holds the slot's bindings (the admin slots console;
 * /agents/slots composes the same editor with its own principal chips).
 * Writes ride the ONE bind path (see ../overrides.ts).
 */

import { useMemo, useState } from "react";
import { Building2, Loader2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { SlotOverrideEditor, type OverridePrincipal } from "./SlotOverrideEditor";
import type { SlotAgentSummary, SlotBindingRow, SlotDefinitionRow } from "../overrides";

export function SlotOverridePanel({
  slot,
  bindings,
  agentsById,
  onChanged,
}: {
  slot: SlotDefinitionRow;
  /** Every binding the surface already loaded for this slot. */
  bindings: SlotBindingRow[];
  agentsById: Record<string, SlotAgentSummary>;
  onChanged: () => void;
}) {
  const userId = useAppSelector(selectUserId);
  const { organizations, loading: orgsLoading } = useUserOrganizations();

  const principals = useMemo<OverridePrincipal[]>(() => {
    const out: OverridePrincipal[] = [
      { key: "user", kind: "user", organizationId: null, label: "Me" },
    ];
    for (const org of organizations) {
      if (org.role === "admin" || org.role === "owner") {
        out.push({ key: `org:${org.id}`, kind: "org", organizationId: org.id, label: org.name });
      }
    }
    return out;
  }, [organizations]);

  const [principalKey, setPrincipalKey] = useState("user");
  const principal = principals.find((p) => p.key === principalKey) ?? principals[0];

  const binding = useMemo<SlotBindingRow | null>(() => {
    if (principal.kind === "user") {
      return (
        bindings.find(
          (b) => b.principal_type === "user" && b.subject_user_id === userId,
        ) ?? null
      );
    }
    return (
      bindings.find(
        (b) => b.principal_type === "org" && b.organization_id === principal.organizationId,
      ) ?? null
    );
  }, [bindings, principal, userId]);

  if (!userId) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {principals.map((p) => {
          const active = p.key === principal.key;
          const hasBinding =
            p.kind === "user"
              ? bindings.some(
                  (b) => b.principal_type === "user" && b.subject_user_id === userId,
                )
              : bindings.some(
                  (b) => b.principal_type === "org" && b.organization_id === p.organizationId,
                );
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setPrincipalKey(p.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/25"
                  : "bg-muted/50 text-muted-foreground ring-1 ring-inset ring-border/60 hover:text-foreground",
              )}
            >
              {p.kind === "user" ? (
                <UserRound className="h-3 w-3" />
              ) : (
                <Building2 className="h-3 w-3" />
              )}
              {p.label}
              {hasBinding ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
            </button>
          );
        })}
        {orgsLoading ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <SlotOverrideEditor
        key={`${principal.key}:${binding?.id ?? "none"}:${binding?.updated_at ?? ""}`}
        slot={slot}
        principal={principal}
        binding={binding}
        agentsById={agentsById}
        onChanged={onChanged}
      />
    </div>
  );
}
