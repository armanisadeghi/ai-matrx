"use client";

// features/emergency-access/components/EmergencyDoorDialog.tsx
//
// 🚨 THIS IS THE ONE DOOR UI ON THE PLATFORM. Every surface that needs to ask
// for emergency access mounts THIS component with a token and an id. There is
// no second form, no per-feature variant, no inline "break glass" panel — a
// second one would drift from this one's wording, its floor, and its promise,
// and the promise is the product: the person whose data it is sees exactly what
// was typed here.
//
// What it is NOT: a toggle that quietly widens what a page shows. Opening the
// door is a deliberate act with a name on it. `confidential` opens now on one
// organization admin's word; `private` opens only after the organization's
// owner approves — the door decides which, and says so in its own sentence.
//
// Three rules this form exists to enforce:
//   1. THE REASON IS A CHOICE, NEVER PROSE. The select is populated from
//      `iam.emergency_door_purposes()` and nothing else, because the audit has
//      to be searchable years from now.
//   2. THE SENTENCE IS FOR A PERSON, NOT A FORM. The justification goes to the
//      human whose data this is, verbatim. The field says so, above the box,
//      before anything is typed.
//   3. THE DOOR'S WORDS WIN. Success or refusal, the returned `message` is
//      rendered exactly as it came back.

import { useEffect, useState } from "react";
import { DoorOpen, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";

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
import { supabase } from "@/utils/supabase/client";

import {
  listEmergencyDoorPurposes,
  openEmergencyDoor,
} from "../service";
import type { EmergencyDoorPurpose } from "../types";
import { recordKindLabel } from "../presentation";

/**
 * The platform default floor — `iam._door_min_chars()` resolves the
 * `platform.access.emergency_door_justification_min_chars` knob and falls back
 * to exactly this. An organization may raise it, so this counter is a courtesy
 * (nobody should type a sentence and lose it to a refusal), NOT the authority:
 * the door checks the org's own floor and, when it refuses, names the real
 * number in its own sentence, which is what gets rendered.
 */
const JUSTIFICATION_MIN_CHARS = 40;

type Phase =
  | { kind: "form" }
  | { kind: "submitting" }
  | { kind: "answered"; granted: boolean; message: string };

export interface EmergencyDoorDialogProps {
  /** `platform.entity_types.token` of the record being asked for. */
  token: string;
  /** The record's id. */
  id: string;
  /** Who the record is about, when the host knows — shown so the person asking
   *  sees whose data they are about to reach for. */
  subjectLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmergencyDoorDialog({
  token,
  id,
  subjectLabel,
  open,
  onOpenChange,
}: EmergencyDoorDialogProps) {
  const [purposes, setPurposes] = useState<EmergencyDoorPurpose[]>([]);
  const [purposesError, setPurposesError] = useState<string | null>(null);
  const [purposesLoading, setPurposesLoading] = useState(false);
  const [purpose, setPurpose] = useState<string>("");
  const [justification, setJustification] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });

  // The reason list is fetched when the dialog opens, not on every mount of
  // every host screen — the door is rare and the list is small.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setPurposesLoading(true);
    setPurposesError(null);
    void listEmergencyDoorPurposes(supabase).then((result) => {
      if (!live) return;
      setPurposesLoading(false);
      if (result.ok) {
        setPurposes(result.data);
        // An empty list is a real condition and it makes the form unusable, so
        // it says so rather than showing an empty picker that looks broken.
        if (result.data.length === 0) {
          setPurposesError(
            "No emergency-access reasons are registered, so there is nothing valid to pick. Nobody can open this door until an administrator registers the reasons.",
          );
        }
      } else {
        setPurposesError(result.message);
      }
    });
    return () => {
      live = false;
    };
  }, [open]);

  // Reopening starts clean — a stale answer from the last record must never be
  // read as this record's answer.
  useEffect(() => {
    if (open) return;
    setPhase({ kind: "form" });
    setPurpose("");
    setJustification("");
  }, [open]);

  const typed = justification.trim().length;
  const shortOfFloor = Math.max(0, JUSTIFICATION_MIN_CHARS - typed);
  const kind = recordKindLabel(token);
  const canSubmit =
    phase.kind === "form" &&
    purpose.length > 0 &&
    typed >= JUSTIFICATION_MIN_CHARS;

  async function submit() {
    setPhase({ kind: "submitting" });
    const result = await openEmergencyDoor(supabase, {
      token,
      id,
      purpose,
      justification: justification.trim(),
    });

    if (!result.ok) {
      // A transport failure is not a refusal; it says so in its own sentence
      // and leaves the typed justification untouched so nothing is lost.
      setPhase({ kind: "answered", granted: false, message: result.message });
      return;
    }
    // Verbatim, both ways. `awaiting_approval` is a success wearing
    // `granted:false`, and the door's sentence is what explains that.
    setPhase({
      kind: "answered",
      granted: result.data.granted,
      message: result.data.message,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DoorOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
            Open the emergency door
          </DialogTitle>
          <DialogDescription>
            {subjectLabel
              ? `You are asking to read ${subjectLabel}'s ${kind.toLowerCase()}.`
              : `You are asking to read a ${kind.toLowerCase()} you have no standing read on.`}{" "}
            Access is read-only and time-boxed, and the person whose data it is
            is told the moment it happens — who you are, what you opened, the
            reason you pick, and the sentence you write below. It stays on their
            record permanently.
          </DialogDescription>
        </DialogHeader>

        {phase.kind === "answered" ? (
          <div
            className={
              phase.granted
                ? "rounded-lg border border-success/50 bg-success/5 p-4"
                : "rounded-lg border border-border bg-muted/40 p-4"
            }
          >
            <p className="flex items-start gap-2 text-sm text-foreground">
              {phase.granted ? (
                <ShieldCheck
                  className="mt-0.5 h-4 w-4 shrink-0 text-success"
                  aria-hidden="true"
                />
              ) : (
                <ShieldAlert
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              {/* The door's own sentence. Never rewritten here. */}
              <span>{phase.message}</span>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="emergency-door-purpose">
                Why you need this record
              </Label>
              <Select
                value={purpose}
                onValueChange={setPurpose}
                disabled={purposesLoading || purposes.length === 0}
              >
                <SelectTrigger id="emergency-door-purpose">
                  <SelectValue
                    placeholder={
                      purposesLoading
                        ? "Loading the registered reasons…"
                        : "Pick a reason"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {purposes.map((item) => (
                    <SelectItem key={item.slug} value={item.slug}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The reason is picked from a registered list, never typed, so
                these can be reviewed together years from now.
              </p>
              {purposesError ? (
                <p className="flex items-start gap-1.5 text-xs text-destructive">
                  <TriangleAlert
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{purposesError}</span>
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emergency-door-justification">
                What has happened, in your own words
              </Label>
              <p className="text-xs text-muted-foreground">
                This sentence is sent to the person whose data this is, exactly
                as you write it. Write it to them.
              </p>
              <Textarea
                id="emergency-door-justification"
                value={justification}
                onChange={(event) => setJustification(event.target.value)}
                rows={5}
                placeholder="Explain what happened and why this record is needed right now."
              />
              <p
                className={
                  shortOfFloor > 0
                    ? "text-xs text-muted-foreground"
                    : "text-xs text-success"
                }
              >
                {shortOfFloor > 0
                  ? `${typed} of ${JUSTIFICATION_MIN_CHARS} characters — ${shortOfFloor} more before this can be sent.`
                  : `${typed} characters. Long enough to send.`}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {phase.kind === "answered" ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
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
                // submit in flight is excluded by it. Repeating the check here
                // is a comparison TypeScript can prove impossible (TS2367).
                disabled={!canSubmit}
              >
                {phase.kind === "submitting"
                  ? "Asking…"
                  : "Ask to open the door"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
