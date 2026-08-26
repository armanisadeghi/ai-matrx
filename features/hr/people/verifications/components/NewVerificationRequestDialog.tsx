// features/hr/people/verifications/components/NewVerificationRequestDialog.tsx
//
// Raise a verification request (SPEC-EMPLOYEES §4.9).
//
// 🚨 CHOOSING "income" TELLS THE USER, HERE, THAT CONSENT IS REQUIRED. Not
// later, when Generate refuses. A gate the person meets only when they are
// blocked by it feels like a bug; a gate they were told about is a rule.
//
// 🚨 A REQUEST FOR SOMEBODY WHO NEVER WORKED HERE IS STILL A RECORD. It is
// raised, then denied with a basis, and the denial is what the organization can
// point at afterwards. That is why the subject picker does not block on "no
// match" — the request is allowed to name a stranger.

"use client";

import { useState } from "react";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { createHrVerificationRequest } from "@/features/hr/service";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import type { HrDenied, HrFailed } from "@/features/hr/types";
import { EmploymentPicker } from "@/features/hr/people/relations/components/EmploymentPicker";

import {
  HR_VERIFICATION_KINDS,
  HR_VERIFICATION_KIND_LABELS,
  HR_VERIFICATION_SOURCES,
  HR_VERIFICATION_SOURCE_LABELS,
  includesCompensation,
  type HrVerificationKind,
  type HrVerificationSource,
} from "../types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewVerificationRequestDialog({
  onClose,
  onCreated,
  onFailed,
}: {
  onClose: () => void;
  onCreated: () => void;
  onFailed: (result: HrDenied | HrFailed) => void;
}) {
  const { active } = useHrContext();

  const [source, setSource] = useState<HrVerificationSource>("third_party");
  const [kind, setKind] = useState<HrVerificationKind>("employment");
  const [subjectEmploymentId, setSubjectEmploymentId] = useState<string | null>(
    null,
  );
  const [subjectName, setSubjectName] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [requesterOrganization, setRequesterOrganization] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [asOf, setAsOf] = useState(today());
  const [saving, setSaving] = useState(false);

  const needsConsent = includesCompensation(kind);
  const canSave =
    (Boolean(subjectEmploymentId) || subjectName.trim().length > 0) && !saving;

  async function save() {
    if (!canSave || !active) return;
    setSaving(true);
    const result = await createHrVerificationRequest({
      organization_id: active.organization_id,
      request_source: source,
      verification_kind: kind,
      includes_compensation: needsConsent,
      subject_employment_id: subjectEmploymentId,
      // Deliberately allowed with no match: a request naming somebody who never
      // worked here becomes a denial with a basis, and that denial IS the record.
      subject_name_asserted: subjectName.trim() || null,
      requester_name: requesterName.trim() || null,
      requester_organization: requesterOrganization.trim() || null,
      requester_email: requesterEmail.trim() || null,
      as_of_date: asOf || null,
    });
    setSaving(false);

    if (result.ok) {
      toast.success(
        needsConsent
          ? "Request raised. The employee has been asked for consent."
          : "Request raised.",
      );
      onCreated();
      return;
    }
    onFailed(result);
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New verification request</DialogTitle>
          <DialogDescription>
            What this organization is being asked to assert, and who is asking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ver-source">Who is asking</Label>
            <Select
              value={source}
              onValueChange={(v) => setSource(v as HrVerificationSource)}
            >
              <SelectTrigger id="ver-source" className="min-h-11 sm:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HR_VERIFICATION_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {HR_VERIFICATION_SOURCE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ver-kind">What it must state</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as HrVerificationKind)}
            >
              <SelectTrigger id="ver-kind" className="min-h-11 sm:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HR_VERIFICATION_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {HR_VERIFICATION_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {needsConsent ? (
              <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Stating income needs the employee&apos;s consent. Raising this
                  asks them for it; the letter cannot be generated until they
                  answer.
                </span>
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ver-subject">Who it is about</Label>
            <EmploymentPicker
              id="ver-subject"
              value={subjectEmploymentId}
              onChange={setSubjectEmploymentId}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ver-subject-name">
              …or the name as the requester wrote it
            </Label>
            <Input
              id="ver-subject-name"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              className="min-h-11 sm:min-h-9"
              placeholder="Used when nobody by that name works or worked here."
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ver-req-name">Requester</Label>
              <Input
                id="ver-req-name"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                className="min-h-11 sm:min-h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ver-req-org">Their organization</Label>
              <Input
                id="ver-req-org"
                value={requesterOrganization}
                onChange={(e) => setRequesterOrganization(e.target.value)}
                className="min-h-11 sm:min-h-9"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ver-req-email">Their email</Label>
              <Input
                id="ver-req-email"
                type="email"
                value={requesterEmail}
                onChange={(e) => setRequesterEmail(e.target.value)}
                className="min-h-11 sm:min-h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ver-asof">As of</Label>
              <Input
                id="ver-asof"
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="min-h-11 sm:min-h-9"
              />
              <p className="text-xs text-muted-foreground">
                Everything the letter asserts is resolved as of this date and
                frozen when it is generated.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="min-h-11 sm:min-h-9"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="min-h-11 sm:min-h-9"
          >
            Raise the request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
