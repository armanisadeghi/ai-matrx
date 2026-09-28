"use client";

/**
 * Member vault access — access ladder decision 14.
 *
 * Under each member's row in organization settings, for the organization's
 * owners and admins: that member's access to the organization's vault —
 * No access, Use only (they and their agents sign in with saved logins without
 * ever seeing passwords), or Editor (see and edit). "Organization default"
 * follows the organization's knob. Owners and admins always have full access,
 * so their rows show nothing here. The list loads ONCE per organization
 * (`useOrganizationVaultMemberAccess`) and each row reads its member from it.
 */

import { useCallback, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import {
  fetchOrganizationVaultMemberAccess,
  setOrganizationVaultMemberAccess,
} from "../vault-service";
import {
  MEMBER_VAULT_ACCESS_LABELS,
  type MemberVaultAccessChoice,
  type VaultMemberAccessList,
} from "../types";

export function useOrganizationVaultMemberAccess(
  organizationId: string,
  enabled: boolean,
) {
  const [data, setData] = useState<VaultMemberAccessList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      setData(await fetchOrganizationVaultMemberAccess(organizationId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [organizationId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload };
}

const DEFAULT_VALUE = "__default__";

export function MemberVaultAccessControl({
  organizationId,
  memberUserId,
  memberName,
  access,
  onChanged,
}: {
  organizationId: string;
  memberUserId: string;
  memberName: string;
  /** The loaded organization list, or null while it loads / when unavailable. */
  access: VaultMemberAccessList | null;
  onChanged: () => Promise<void> | void;
}) {
  const [saving, setSaving] = useState(false);
  if (!access) return null;
  const member = access.members.find((m) => m.user_id === memberUserId);
  if (!member || member.effective_access === "admin") return null;

  const value = member.vault_access ?? DEFAULT_VALUE;
  const defaultLabel = MEMBER_VAULT_ACCESS_LABELS[access.default_access];

  const change = async (next: string) => {
    const chosen: MemberVaultAccessChoice | null =
      next === DEFAULT_VALUE ? null : (next as MemberVaultAccessChoice);
    setSaving(true);
    try {
      const result = await setOrganizationVaultMemberAccess(
        organizationId,
        memberUserId,
        chosen,
      );
      toast.success(
        `${memberName}'s vault access is now ${MEMBER_VAULT_ACCESS_LABELS[result.effective_access].toLowerCase()}`,
      );
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Select value={value} onValueChange={(v) => void change(v)} disabled={saving}>
      <SelectTrigger
        className="h-7 w-auto gap-1 border-none px-2 text-xs text-muted-foreground shadow-none hover:bg-accent"
        aria-label={`${memberName}'s access to the organization vault`}
        data-member-vault-access={memberUserId}
      >
        <KeyRound className="h-3.5 w-3.5" />
        <span>Vault:</span>
        <SelectValue>
          {member.vault_access
            ? MEMBER_VAULT_ACCESS_LABELS[member.vault_access]
            : `Default (${defaultLabel})`}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_VALUE}>
          Organization default ({defaultLabel})
        </SelectItem>
        <SelectItem value="none">No access</SelectItem>
        <SelectItem value="use">Use only — sign in, never see passwords</SelectItem>
        <SelectItem value="editor">Editor — see and edit</SelectItem>
      </SelectContent>
    </Select>
  );
}
