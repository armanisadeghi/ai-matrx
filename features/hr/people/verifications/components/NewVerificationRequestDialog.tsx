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
import { Input } from "@ai-matrx/design-system";
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
import type { HrDenied, HrFailed, HrResult } from "@/features/hr/types";
import { hrErrorSentence } from "@/features/hr/shared/HrStates";
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
  const [refusal, setRefusal] = useState<HrResult<unknown> | null>(null);

  const needsConsent = includesCompensation(kind);
  const canSave =
    (Boolean(subjectEmploymentId) || subjectName.trim().length > 0) && !saving;

  async function save() {
    if (!canSave || !active) return;
    setSaving(true);
    setRefusal(null);
    const result = await createHrVerificationRequest({
      employmentId: subjectEmploymentId,
      requestSource: source,
      verificationKind: kind,
      requesterName: requesterName.trim() || null,
      requesterOrganization: requesterOrganization.trim() || null,
      requesterEmail: requesterEmail.trim() || null,
    });
    setSaving(false);

    if (result.ok) {
      /*
        🚨 THE ASK IS REAL NOW, AND THIS SENTENCE HAD TO CHANGE TWICE.
        It originally claimed "The employee has been asked for consent." while NOTHING
        asked them: `hr_verification_request_create` wrote the row and touched no
        notification, workflow or task, there was no read door for "requests awaiting MY
        consent", and no surface to answer on. So it was cut back to state only what had
        actually happened.
        `hr_l1_54` built the missing half — the raise now fires
        `hr.people.verification_consent_requested` (seeded since hr_l1_08 and never once
        emitted) to the subject by login linkage, and `/hr/me` carries the surface where
        they answer. The claim is true again, so it is made again. Understating is also a
        kind of wrong: HR needs to know the ball is in the employee's court.
      */
      toast.success(
        needsConsent
          ? "Request raised. The employee has been asked for their consent; the letter cannot be generated until they answer."
          : "Request raised.",
      );
      onCreated();
      return;
    }
    /*
      🚨 THE REFUSAL RENDERS WHERE THE PERSON IS LOOKING.
      This called `onFailed`, which fired a toast — and the dialog stayed open,
      unchanged, with the typed request still in it. A toast beside an open form
      that looks exactly as it did before is a refusal nobody can act on. The
      dialog is the host here: it survives, so it carries the sentence.
    */
    setRefusal(result);
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
          {refusal && !refusal.ok ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
            >
              {hrErrorSentence(refusal, "Raising this request")}
            </p>
          ) : null}
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
                {/*
                  🚨 "Raising this asks them for it" WAS REMOVED AS FALSE, AND IS BACK
                  BECAUSE IT BECAME TRUE. When raising notified nobody and there was no
                  surface to answer on, the clause was a lie and was cut. `hr_l1_54` made
                  the ask real — the raise emits `hr.people.verification_consent_requested`
                  to the subject, who answers on `/hr/me` — so the sentence describes what
                  the button actually does again. If that emitter is ever removed, this
                  clause goes with it.
                */}
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
