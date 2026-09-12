// features/emergency-access/components/EmergencyDoorDialog.tsx
//
// THE ONE DOOR UI ON THE PLATFORM (DD-137a).
//
// There is no second break-glass form anywhere — HR never had one (`hrBreakGlass`
// shipped with zero call sites), so this is the first and only one, and it is
// built at the platform layer so every module inherits it rather than growing
// its own. If a surface needs an emergency door, it mounts THIS.
//
// 🚨 THE REASON IS A CHOICE, NEVER A SENTENCE. The picker is populated from
// `iam.emergency_door_purposes()`. A typed reason cannot be reported on years
// later, so the database refuses one — and this form never offers the option.
//
// 🚨 THE JUSTIFICATION GOES TO THE PERSON. Whatever is typed here is delivered
// to the human whose data is being opened, by name, at the moment it happens.
// The form says so above the box, because somebody who knows that writes a
// different sentence than somebody who thinks it disappears into a log.
//
// 🚨 EVERY OUTCOME IS THE DATABASE'S OWN SENTENCE. Grant, "needs your owner's
// approval", and every refusal all arrive with a `message` written once in SQL.
// This component renders it verbatim and invents nothing.

"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, KeyRound, Loader2, ShieldAlert } from "lucide-react";

import { supabase } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { listEmergencyDoorPurposes, openEmergencyDoor } from "../service";
import type { EmergencyDoorPurpose } from "../types";

/**
 * The floor the database enforces
 * (`platform.access.emergency_door_justification_min_chars`, 40 today).
 *
 * 🚨 THIS NUMBER IS A HINT, NOT THE RULE. The knob is organization-overridable
 * upward, so the server may want more than this. The form therefore never
 * blocks submission on it — it counts up to it, and the door's own refusal
 * sentence ("Say why, in at least N characters…") is the authority. A client
 * that hard-blocks at a stale number is a client that lies about the rule.
 */
const JUSTIFICATION_FLOOR_HINT = 40;

export interface EmergencyDoorDialogProps {
  /** `platform.entity_types.token` of the record being opened. */
  token: string;
  /** The row id. */
  id: string;
  /** Optional: whose data it is, for the dialog's own sentence. */
  subjectLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase =
  | { kind: "form" }
  | { kind: "submitting" }
  | { kind: "answered"; granted: boolean; message: string };

export function EmergencyDoorDialog({
  token,
  id,
  subjectLabel,
  open,
  onOpenChange,
}: EmergencyDoorDialogProps) {
  const [purposes, setPurposes] = useState<EmergencyDoorPurpose[] | null>(null);
  const [purposesError, setPurposesError] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("");
  const [justification, setJustification] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });

  // The reason list is the door's own controlled vocabulary. It is fetched when
  // the dialog opens rather than on mount so a surface can keep this component
  // permanently mounted without a request nobody asked for.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPurposesError(null);
    void listEmergencyDoorPurposes(supabase).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setPurposes(result.data);
      } else {
        // Nothing silent: an empty picker with no explanation is a dead screen.
        setPurposes([]);
        setPurposesError(result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reopening is a fresh act, never a resumed one: a justification left over
  // from the last record would be delivered, by name, to a different person.
  useEffect(() => {
    if (open) return;
    setPhase({ kind: "form" });
    setPurpose("");
    setJustification("");
  }, [open]);

  const submit = useCallback(async () => {
    setPhase({ kind: "submitting" });
    const result = await openEmergencyDoor(supabase, {
      token,
      id,
      purpose,
      justification,
    });
    if (!result.ok) {
      setPhase({ kind: "answered", granted: false, message: result.message });
      return;
    }
    setPhase({
      kind: "answered",
      granted: result.data.granted,
      message: result.data.message,
    });
  }, [token, id, purpose, justification]);

  const typed = justification.trim().length;
  const canSubmit =
    phase.kind === "form" && purpose.length > 0 && typed > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            Open the emergency door
          </DialogTitle>
          <DialogDescription>
            {subjectLabel
              ? `You are asking to read ${subjectLabel}'s private data.`
              : "You are asking to read someone else's private data."}{" "}
            It is read-only, it expires by itself, and they are told who you are
            and why the moment it happens.
          </DialogDescription>
        </DialogHeader>

        {phase.kind === "answered" ? (
          <div className="space-y-4">
            <div
              className={
                phase.granted
                  ? "flex gap-3 rounded-md border border-border bg-muted/40 p-3"
                  : "flex gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3"
              }
            >
              {phase.granted ? (
                <KeyRound className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
              ) : (
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
              )}
              {/* The database's sentence, verbatim. */}
              <p className="text-sm leading-relaxed">{phase.message}</p>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emergency-door-purpose">Reason</Label>
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger id="emergency-door-purpose">
                  <SelectValue
                    placeholder={
                      purposes === null ? "Loading reasons…" : "Pick a reason"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(purposes ?? []).map((option) => (
                    <SelectItem key={option.slug} value={option.slug}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {purposesError ? (
                <p className="flex items-start gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {purposesError} Without the list this form cannot be
                  submitted — the door only accepts a registered reason.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Reasons come from a fixed list so they can be reported on
                  later. There is no free-text option.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="emergency-door-justification">
                Why you need it
              </Label>
              <Textarea
                id="emergency-door-justification"
                value={justification}
                onChange={(event) => setJustification(event.target.value)}
                rows={4}
                placeholder="What happened, and what you need from this record."
                aria-describedby="emergency-door-justification-help"
              />
              <p
                id="emergency-door-justification-help"
                className="text-xs text-muted-foreground"
              >
                This sentence is sent to the person whose data it is, word for
                word, with your name on it.{" "}
                {typed < JUSTIFICATION_FLOOR_HINT
                  ? `${typed} of about ${JUSTIFICATION_FLOOR_HINT} characters.`
                  : `${typed} characters.`}
              </p>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={phase.kind === "submitting"}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void submit()}
                // `canSubmit` already requires `phase.kind === "form"`, so a
                // submit in flight is excluded by it — adding the check again
                // is a comparison TypeScript can prove impossible.
                disabled={!canSubmit}
              >
                {phase.kind === "submitting" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Asking…
                  </>
                ) : (
                  "Open the door"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default EmergencyDoorDialog;
