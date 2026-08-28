/**
 * features/hr/time/clock/SetKioskPinCard.tsx — the employee sets their own kiosk PIN (R3).
 *
 * 🚨 **`hr_set_employment_pin` HAD ZERO CALLERS.** The whole kiosk chain depends on it — a tablet
 * can be paired, trusted and powered on, and still nobody can punch on it, because no employment has
 * a PIN and no surface existed to set one. This is that surface.
 *
 * 🚨 **THE DOOR HAS TWO ARMS AND THIS COMPONENT SERVES BOTH.** `hr_set_employment_pin` authorises
 * *"an HR writer **or the subject themselves**"*. For a long time only the self arm was mounted —
 * on the employee's own clock, behind a login — which meant **the kiosk's own population could not
 * be given a PIN by anybody**: the login-less staff a shared wall tablet exists for had no surface
 * on either side of the door. The `hr` audience below is the missing arm, mounted on the employee
 * profile's Time & schedule tab (SPEC-UI-IA §4.1 — a PIN belongs to a PERSON, and the devices page
 * is device-scoped with no employee list by kiosk doctrine).
 *
 * One component, two audiences, deliberately: the masking, the never-held discipline, the
 * type-it-twice rule and the refusal rendering are identical, and a second copy would drift on the
 * half nobody is looking at.
 *
 * 🚨 **THE PIN CANNOT BE READ BACK, SO IT IS ENTERED TWICE.** The server stores a bcrypt hash,
 * returns `{granted, employment_pin_id, audit_id}`, and never echoes the value. A single-field form
 * for a write-only secret means one typo locks somebody out of the time clock until an
 * administrator resets it.
 *
 * 🚨 **THE LENGTH IS THE SERVER'S, AND IT IS NOT GUESSED HERE.** `kiosk_pin_length` is a knob and
 * no client read carries it, so this form does not invent a rule: it submits, and where the shape is
 * wrong the server's own sentence names the exact length. A hardcoded `4` would silently disagree
 * with any employer that configured something else.
 *
 * 🚨 **A REFUSAL HERE DOES NOT THROW.** This door answers `{granted:false, reason, detail}` with no
 * `ok` key, so the transport passes it through as data. Code that only wrapped this in a try/catch
 * would treat every refusal as a success.
 */

"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setEmploymentPin } from "@/features/hr/time/api/service";
import { toast } from "@/lib/toast";

/**
 * The server's sentences name the knob that produced them — *"…(hr.time_and_attendance.
 * kiosk_pin_length)"*. That trailing key is for an administrator reading a log, not for an hourly
 * employee reading a form, and F7's law is that a machine token is not page text. The sentence is
 * kept verbatim; only the parenthetical key is dropped.
 */
function withoutKnobKey(sentence: string): string {
  return sentence.replace(/\s*\((?:hr|platform)\.[a-z0-9_.]+\)\s*$/i, "").trim();
}

export interface SetKioskPinCardProps {
  employmentId: string;
  /**
   * Which arm of the door this is. `self` is the employee setting their own; `hr` is a
   * `working_record.write` holder setting or resetting somebody else's. The server enforces both —
   * this only decides the wording, so a mis-set prop cannot grant anything.
   */
  audience?: "self" | "hr";
  /** Whose PIN, on the `hr` arm. Named so an administrator cannot set the wrong person's. */
  subjectName?: string | null;
  /**
   * Whether this person has a platform login. `undefined` means the viewer was never allowed to
   * ask (the profile omits the key rather than nulling it), so the card says nothing about it
   * instead of guessing.
   */
  hasLogin?: boolean;
}

export function SetKioskPinCard({
  employmentId,
  audience = "self",
  subjectName,
  hasLogin,
}: SetKioskPinCardProps) {
  const hr = audience === "hr";
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const digitsOnly = /^[0-9]*$/;
  const mismatch = confirmPin.length > 0 && pin !== confirmPin;
  const canSubmit = pin.length > 0 && pin === confirmPin && !busy;

  async function save() {
    if (!canSubmit) return;
    setBusy(true);
    setRefusal(null);
    try {
      const result = await setEmploymentPin(employmentId, pin);
      // 🚨 Not a thrown refusal — see the header. `granted` is the answer.
      if (result?.granted === false) {
        const detail = typeof result.detail === "string" ? result.detail : null;
        setRefusal(
          detail
            ? withoutKnobKey(detail)
            : "That PIN was not accepted. Ask an HR administrator for help.",
        );
        return;
      }
      setPin("");
      setConfirmPin("");
      setOpen(false);
      toast.success(hr ? `Time clock PIN set for ${subjectName ?? "this employee"}` : "Your kiosk PIN is set");
    } catch (cause: unknown) {
      setRefusal(
        cause instanceof Error && cause.message.trim()
          ? cause.message
          : "We could not set your PIN just now.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="min-h-[48px] w-full gap-2"
      >
        <KeyRound className="size-4" />
        {hr ? "Set or reset this person's time clock PIN" : "Set my time clock PIN"}
      </Button>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">
          {hr
            ? `Time clock PIN${subjectName ? ` for ${subjectName}` : ""}`
            : "Your time clock PIN"}
        </h2>
        {hr ? (
          <>
            <p className="text-sm text-muted-foreground">
              {/*
                Said plainly, because this arm exists for a population that cannot use the other
                one: staff who have no platform login and therefore no clock surface of their own.
              */}
              Set or reset the kiosk PIN for someone without a login. They type it on a shared
              tablet along with their employee number.
            </p>
            {hasLogin === true && (
              <p className="text-sm text-muted-foreground">
                This person has a login and can set their own PIN from their time clock. Setting one
                here replaces it, and they are not told what it is.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            This is what you type on a shared time clock tablet, along with your employee number.
            Only you know it — nobody can look it up, so choose something you will remember.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="hr-kiosk-pin" className="text-sm font-medium text-foreground">
          {hr ? "New PIN for this person" : "New PIN"}
        </label>
        <Input
          id="hr-kiosk-pin"
          value={pin}
          onChange={(event) => {
            if (digitsOnly.test(event.target.value)) setPin(event.target.value);
          }}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          /* ≥16px so iOS does not zoom on focus. */
          className="min-h-[52px] text-base tracking-widest"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="hr-kiosk-pin-confirm" className="text-sm font-medium text-foreground">
          Type it again
        </label>
        <Input
          id="hr-kiosk-pin-confirm"
          value={confirmPin}
          onChange={(event) => {
            if (digitsOnly.test(event.target.value)) setConfirmPin(event.target.value);
          }}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          className="min-h-[52px] text-base tracking-widest"
        />
        {mismatch && (
          <p className="text-sm text-foreground">Those two do not match.</p>
        )}
      </div>

      {hr && (
        /*
          🚨 The PIN is stored as a bcrypt hash and is never returned. An administrator who sets one
          and does not hand it over has locked the person out, and nothing in the product can
          recover it — only another reset. Saying so here is cheaper than the support call.
        */
        <p className="text-sm text-muted-foreground">
          Write this down before you save it. It cannot be read back afterwards — only replaced.
        </p>
      )}

      {refusal && <p className="text-sm text-foreground">{refusal}</p>}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => void save()}
          className="min-h-[52px] gap-2 text-base"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {hr ? "Save this PIN" : "Save my PIN"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setPin("");
            setConfirmPin("");
            setRefusal(null);
          }}
          className="min-h-[48px]"
        >
          Cancel
        </Button>
      </div>
    </section>
  );
}
