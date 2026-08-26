// features/hr/people/relations/components/IncidentPartiesPanel.tsx
//
// 🚨 ADDING AN `accused` PARTY RE-MATERIALISES THE EXCLUSION IN THE **SAME
// TRANSACTION**. The new respondent loses reach immediately — including when
// the new respondent is the person doing the adding, in which case their very
// next request refuses and the surface redirects with a NEUTRAL message. It
// never explains what happened, because the explanation is itself the leak.
//
// That is why this panel confirms before adding an `accused`: not to be polite,
// but because the act has an immediate, irreversible access consequence that
// the person clicking may not have understood.
//
// Either `employment_id` OR `external_name` is required — a witness who does
// not work here is still a witness, and a record that can only name employees
// produces an investigation file with holes in it.

"use client";

import { useState } from "react";
import { Plus, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { addHrIncidentParty } from "@/features/hr/service";
import { hrErrorSentence } from "@/features/hr/shared/HrStates";

import {
  HR_INCIDENT_PARTY_ROLES,
  HR_INCIDENT_PARTY_ROLE_LABELS,
  type HrIncidentParty,
  type HrIncidentPartyRole,
} from "../types";
import { EmploymentPicker } from "./EmploymentPicker";

export function IncidentPartiesPanel({
  incidentId,
  parties,
  canWrite,
  onChanged,
  onLostReach,
}: {
  incidentId: string;
  parties: HrIncidentParty[] | undefined;
  canWrite: boolean;
  onChanged: () => void;
  /** Called when the caller just accused themselves and must be moved away. */
  onLostReach: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState<HrIncidentPartyRole>("witness");
  const [employmentId, setEmploymentId] = useState<string | null>(null);
  const [externalName, setExternalName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (parties === undefined) return null;

  const canSave =
    (Boolean(employmentId) || externalName.trim().length > 0) && !saving;

  async function save() {
    if (!canSave) return;

    if (role === "accused") {
      const ok = await confirm({
        title: "Add this person as accused?",
        description:
          "They lose access to this case immediately and no override restores it. If that person is you, you will not be able to open this case again.",
        confirmLabel: "Add as accused",
        variant: "destructive",
      });
      if (!ok) return;
    }

    setSaving(true);
    const result = await addHrIncidentParty({
      incidentId,
      role,
      employmentId,
      externalName: externalName.trim() || null,
      note: note.trim() || null,
    });
    setSaving(false);

    if (result.ok) {
      setEmploymentId(null);
      setExternalName("");
      setNote("");
      setAdding(false);
      // The write may have just revoked the writer. A refresh that comes back
      // denied is handled by the case surface, which redirects neutrally.
      onChanged();
      return;
    }

    if (result.kind === "denied") {
      // Already out. Do not explain.
      onLostReach();
      return;
    }
    toast.error(hrErrorSentence(result, "Adding this party"));
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <UserPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          Parties
        </h3>
        {canWrite && !adding ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 shrink-0 sm:min-h-9"
            onClick={() => setAdding(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add a party
          </Button>
        ) : null}
      </div>

      {adding ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="party-role">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as HrIncidentPartyRole)}
            >
              <SelectTrigger id="party-role" className="min-h-11 sm:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HR_INCIDENT_PARTY_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {HR_INCIDENT_PARTY_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {role === "accused" ? (
              <p className="text-xs text-destructive">
                This person loses access to the case the moment you add them,
                and nothing restores it.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="party-employment">Someone who works here</Label>
            <EmploymentPicker
              id="party-employment"
              value={employmentId}
              onChange={setEmploymentId}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="party-external">…or a name from outside</Label>
            <Input
              id="party-external"
              value={externalName}
              onChange={(e) => setExternalName(e.target.value)}
              className="min-h-11 sm:min-h-9"
              placeholder="A customer, a contractor's employee, a first responder"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="party-note">Note</Label>
            <Input
              id="party-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-11 sm:min-h-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={!canSave}
              className="min-h-11 sm:min-h-9"
            >
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAdding(false)}
              className="min-h-11 sm:min-h-9"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {parties.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nobody recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {parties.map((party) => (
            <li
              key={party.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
            >
              <Badge
                variant={party.role === "accused" ? "destructive" : "outline"}
                className="text-xs"
              >
                {HR_INCIDENT_PARTY_ROLE_LABELS[
                  party.role as HrIncidentPartyRole
                ] ?? party.role}
              </Badge>
              <span className="min-w-0 truncate text-sm text-foreground">
                {party.display_name ?? party.external_name}
              </span>
              {party.note ? (
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {party.note}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
