"use client";

/**
 * Per-member admin controls: tier/level, storage cap, monthly budget, notes.
 * Advisory in v1 — values are stored, tracked, and surfaced; hard enforcement into the
 * upload/usage paths is a deliberate follow-up (see features/organizations/admin/FEATURE.md).
 */
import React, { useState } from "react";
import { Info, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setMemberControls } from "../service";
import type { OrgAdminMember } from "../types";
import { bytesToGb, gbToBytes, usdToMcents } from "../utils";

interface Props {
  orgId: string;
  member: OrgAdminMember;
  onSaved: () => void;
}

export function MemberControlsForm({ orgId, member, onSaved }: Props) {
  const [memberLevel, setMemberLevel] = useState(member.memberLevel ?? "");
  const [tierOverride, setTierOverride] = useState(member.tierOverride ?? "");
  const [storageCapGb, setStorageCapGb] = useState(bytesToGb(member.storageCapBytes));
  const [budgetUsd, setBudgetUsd] = useState(
    member.monthlyBudgetMcents == null ? "" : String(member.monthlyBudgetMcents / 100000),
  );
  const [notes, setNotes] = useState(member.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await setMemberControls(orgId, member.userId, {
        memberLevel: memberLevel.trim() || null,
        tierOverride: tierOverride.trim() || null,
        storageCapBytes: gbToBytes(storageCapGb),
        monthlyBudgetMcents: usdToMcents(budgetUsd),
        notes: notes.trim() || null,
      });
      toast.success("Controls saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save controls");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="member-level">Member level / tier</Label>
          <Input
            id="member-level"
            value={memberLevel}
            onChange={(e) => setMemberLevel(e.target.value)}
            placeholder="e.g. premium, enterprise"
          />
          <p className="text-xs text-muted-foreground">Org-defined access label for this user.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tier-override">Storage tier override</Label>
          <Input
            id="tier-override"
            value={tierOverride}
            onChange={(e) => setTierOverride(e.target.value)}
            placeholder="account_tiers id (optional)"
          />
          <p className="text-xs text-muted-foreground">Overrides the user&apos;s default storage tier.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="storage-cap">Storage capacity (GB)</Label>
          <Input
            id="storage-cap"
            type="number"
            min={0}
            step="0.5"
            value={storageCapGb}
            onChange={(e) => setStorageCapGb(e.target.value)}
            placeholder="Unlimited"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="budget">Monthly budget (USD)</Label>
          <Input
            id="budget"
            type="number"
            min={0}
            step="1"
            value={budgetUsd}
            onChange={(e) => setBudgetUsd(e.target.value)}
            placeholder="No limit"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Admin notes</Label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Internal notes about this member (optional)"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Controls are tracked and shown across the admin dashboard. Hard enforcement (blocking
          uploads / usage at the limit) is wired in a follow-up — see the feature doc.
        </span>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} size="sm">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save controls
        </Button>
      </div>
    </div>
  );
}
