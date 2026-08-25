"use client";

// features/admin/shared-knowledge/components/IndustryCuratorsPanel.tsx
//
// Curators of ONE industry — the outside experts allowed to AUTHOR and PROPOSE
// Library resources (starter packs today) for that industry. A curator is a
// normal account + `industry_curator_grant`; they never ratify, publish or
// create industries (D5, 2026-08-22). Roster via `industry_curator_list`
// (admin), grant/revoke via the existing RPC pair; people are found by email
// through the canonical `searchUserByEmail`.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Loader2, Plus, ShieldCheck, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { searchUserByEmail } from "@/features/organizations/userSearch";
import {
  fetchIndustryCurators,
  grantIndustryCurator,
  revokeIndustryCurator,
  type IndustryCurator,
} from "@/features/industries/service";
import type { Industry } from "@/features/industries/types";
import { UserSearchField } from "@/features/user-search/UserSearchField";

export function IndustryCuratorsPanel({ industry }: { industry: Industry }) {
  const [curators, setCurators] = useState<IndustryCurator[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<IndustryCurator | null>(
    null,
  );
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [bumper, setBumper] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchIndustryCurators(industry.id)
      .then((rows) => {
        if (!cancelled) setCurators(rows);
      })
      .catch((e) => {
        if (!cancelled) toast.error(extractErrorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [industry.id, bumper]);

  const onGrant = async () => {
    const value = email.trim();
    if (!value) return;
    setGranting(true);
    try {
      const found = selectedUserId ? null : await searchUserByEmail(value);
      if (!selectedUserId && !found?.exists) {
        toast.error(
          "No account with that email — curators are normal platform accounts.",
        );
        return;
      }
      const userId = selectedUserId ?? found?.id;
      if (!userId) return;
      await grantIndustryCurator(userId, industry.id);
      toast.success(`${value} can now author ${industry.name} packs`);
      setEmail("");
      setSelectedUserId(null);
      setBumper((b) => b + 1);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setGranting(false);
    }
  };

  const onRevoke = async () => {
    if (!revokeTarget) return;
    setRevokeBusy(true);
    try {
      await revokeIndustryCurator(revokeTarget.userId, industry.id);
      toast.success("Curator access revoked");
      setRevokeTarget(null);
      setBumper((b) => b + 1);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setRevokeBusy(false);
    }
  };

  return (
    <div className="mt-5 space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <ShieldCheck
          className="h-3.5 w-3.5 text-muted-foreground"
          aria-hidden
        />
        Curators of “{industry.name}”
      </div>
      <p className="text-xs text-muted-foreground">
        Outside experts who may author and propose starter packs for this
        industry. They never ratify or publish — that stays with platform
        admins.
      </p>
      <div className="flex gap-2">
        <UserSearchField
          value={email}
          onValueChange={(value) => {
            setEmail(value);
            setSelectedUserId(null);
          }}
          onEnter={() => void onGrant()}
          onUserSelect={(user) => {
            setEmail(user.email ?? user.displayName ?? user.id);
            setSelectedUserId(user.id);
          }}
          directory="admin"
          excludeUserIds={curators.map((curator) => curator.userId)}
          title={`Choose a curator for ${industry.name}`}
          placeholder="Search an existing account…"
          inputType="email"
          disabled={granting}
          className="min-w-0 flex-1"
          inputClassName="h-9"
        />
        <Button
          onClick={onGrant}
          disabled={!email.trim() || granting}
          size="sm"
          className="shrink-0"
        >
          {granting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          Make curator
        </Button>
      </div>
      {loading && curators.length === 0 ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : curators.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
          No curators yet — only platform admins can author packs for this
          industry.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {curators.map((c) => (
            <li
              key={c.userId}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-foreground">
                {c.displayName ? `${c.displayName} · ` : ""}
                <span className="text-muted-foreground">
                  {c.email ?? c.userId}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-muted-foreground hover:text-destructive"
                onClick={() => setRevokeTarget(c)}
                aria-label={`Revoke curator ${c.email ?? c.userId}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title="Revoke curator access?"
        description={
          revokeTarget
            ? `${revokeTarget.email ?? revokeTarget.userId} will no longer be able to author or propose packs for “${industry.name}”. Packs they already authored stay.`
            : undefined
        }
        variant="destructive"
        confirmLabel="Revoke"
        busy={revokeBusy}
        onConfirm={onRevoke}
      />
    </div>
  );
}
