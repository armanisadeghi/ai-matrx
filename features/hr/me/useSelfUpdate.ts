// features/hr/me/useSelfUpdate.ts
//
// THE SINGLE WRITE PATH FOR SELF-SERVICE (SPEC-EMPLOYEES §7.1).
//
// 🚨 `hr_self_update` IS THE ONLY DOOR. Not `hr_employee_update` with a self
// check, not a direct write. The server splits the patch: `free` keys apply,
// `request_approval` keys become workflow requests and apply NOTHING, and
// `hr_only`/`read_only`/unknown keys are REJECTED.
//
// 🚨 A REFUSAL NAMES EVERY OFFENDING FIELD, AND SO DOES THE MESSAGE THIS HOOK
// PRODUCES. "Some fields could not be saved" is the exact defect the
// `rejected:[{field,policy}]` shape exists to replace, and re-collapsing it
// into a vague sentence here would put the defect straight back.
//
// 🚨 A PARTIAL RESULT IS THE NORMAL CASE AND IT IS SAID OUT LOUD. Editing a
// preferred name and a home address in one save applies one and queues the
// other, and the person is told exactly which was which — never "Saved".

"use client";

import { useCallback, useState } from "react";

import { toast } from "@/lib/toast";
import { updateHrSelf } from "@/features/hr/service";

import {
  humanFieldName,
  isSelfUpdateAck,
  isSelfUpdateRefusal,
  selfUpdateFields,
  type HrSelfUpdateRefusal,
} from "./selfServicePolicy";

export type HrSelfUpdateState = {
  saving: boolean;
  /** Field keys the server refused, with WHY, kept for inline rendering. */
  rejected: { field: string; policy: string }[];
  /*
    🚨 THE FAILURE THE FIELD CANNOT RENDER, HELD BY THE HOST.
    A transport-level failure (a 400 from a broken door, a dropped connection)
    used to be announced ONLY as a toast, fired from a control that unmounts
    itself in the same tick. When the door `hr.wf_request` broke platform-wide,
    what a person saw was: the editor closed, the value they typed was gone, and
    the record was unchanged — with nothing on screen saying so. A surface that
    reports its errors only through the control that just disappeared has no way
    to report the errors that matter most.

    So the sentence lives HERE, in the hook the HOST owns, and the host renders
    it. It survives the field unmounting, and it is cleared by the next
    successful write rather than by a timer.
  */
  failure: { sentence: string; technical: string | null } | null;
  clearFailure: () => void;
  /** `true` only when the write actually landed — the caller closes its editor on that. */
  save: (field: string, value: unknown) => Promise<boolean>;
  savePatch: (patch: Record<string, unknown>) => Promise<boolean>;
};

function listFields(fields: string[]): string {
  const names = fields.map(humanFieldName);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function useSelfUpdate(args: {
  /** `hr_employee` and this person's own employee id. */
  token?: string;
  employeeId: string | null;
  onApplied: () => void;
}): HrSelfUpdateState {
  const { token = "hr_employee", employeeId, onApplied } = args;
  const [saving, setSaving] = useState(false);
  const [rejected, setRejected] = useState<{ field: string; policy: string }[]>(
    [],
  );
  const [failure, setFailure] = useState<
    { sentence: string; technical: string | null } | null
  >(null);
  const clearFailure = useCallback(() => setFailure(null), []);

  const savePatch = useCallback(
    async (patch: Record<string, unknown>): Promise<boolean> => {
      if (!employeeId) {
        // Not "nothing happened": there is no record to write to, and saying so
        // beats a control that silently does nothing every time it is pressed.
        setFailure({
          sentence: "This record is not ready to take changes yet.",
          technical: null,
        });
        return false;
      }
      setSaving(true);
      const result = await updateHrSelf({ token, id: employeeId, patch });
      setSaving(false);

      if (!result.ok) {
        /*
          🚨 THE NAMED REFUSAL ARRIVES HERE, NOT BELOW — AND IT USED TO DIE HERE.
          `hr_self_update` refuses with `{ok:false, reason:'fields_not_self_writable',
          rejected:[{field,policy}], unknown:[…]}`, and the transport's
          `isRefusalEnvelope` matches on `ok === false`, so EVERY field refusal became
          a `denied` result before reaching the `isSelfUpdateRefusal` branch further
          down. That branch — the whole naming machinery — was unreachable code, and
          what the person actually saw was the door's generic sentence: "These fields
          are held by HR and cannot be changed here." Which fields? It never said.
          That is precisely the "some fields could not be saved" defect the
          `rejected:[{field,policy}]` shape exists to replace, rebuilt by accident one
          layer lower. `denied` carries the whole payload for exactly this reason.
        */
        if (result.kind === "denied") {
          const raw = (result.payload ?? {}) as Partial<HrSelfUpdateRefusal> & {
            fields?: unknown;
          };
          const named = Array.isArray(raw.rejected)
            ? raw.rejected.map((r) => r.field)
            : [];
          const unknownFields = Array.isArray(raw.unknown) ? raw.unknown : [];

          if (named.length > 0 || unknownFields.length > 0) {
            setRejected(Array.isArray(raw.rejected) ? raw.rejected : []);
            const parts: string[] = [];
            if (named.length > 0) {
              parts.push(`${listFields(named)} can only be changed by HR.`);
            }
            if (unknownFields.length > 0) {
              parts.push(
                `${listFields(unknownFields)} is not a field on your record.`,
              );
            }
            const sentence = parts.join(" ");
            setFailure({ sentence, technical: null });
            toast.error(sentence);
            return false;
          }
        }

        // Anything else: the self lane itself refused — a terminated person, a
        // record that is not theirs, or an approval route that does not exist.
        // `request_not_opened` already names its fields in `detail`.
        //
        // 🚨 A `failed` RESULT IS A BROKEN DOOR, NOT A DECISION ABOUT THIS PERSON.
        // It says WHAT HAPPENED and stops: the change was not saved, and the
        // server did not accept the request. It does NOT tell them to try again
        // or wait — when a door is broken platform-wide, "try again" is advice
        // that cannot work, and a surface that offers it is guessing at a remedy
        // it has no way to stand behind.
        // The transport already says the save did not go through, so this does not
        // say it a second time — two sentences making the same point read as noise
        // and push the part that identifies the failure off the end.
        const sentence =
          result.kind === "denied"
            ? result.detail?.trim() ||
              "That change is not something you can make here."
            : result.message;
        setFailure({
          sentence,
          technical: result.kind === "failed" ? result.technical ?? null : null,
        });
        toast.error(sentence);
        return false;
      }

      const payload = result.data as unknown;

      if (isSelfUpdateRefusal(payload)) {
        setRejected(payload.rejected);
        // EVERY offending field, BY NAME. Never "some fields".
        const parts: string[] = [];
        if (payload.rejected.length > 0) {
          parts.push(
            `${listFields(payload.rejected.map((r) => r.field))} can only be changed by HR.`,
          );
        }
        if (payload.unknown.length > 0) {
          parts.push(
            `${listFields(payload.unknown)} is not a field on your record.`,
          );
        }
        const sentence = parts.join(" ");
        setFailure({ sentence, technical: null });
        toast.error(sentence);
        return false;
      }

      setRejected([]);

      if (isSelfUpdateAck(payload)) {
        // The names, out of the keys — see `HrSelfUpdateAck` for why these are
        // objects and not arrays.
        const applied = selfUpdateFields(payload.applied);
        const requested = selfUpdateFields(payload.requested);

        // A partial result said out loud, both halves named.
        if (applied.length > 0 && requested.length > 0) {
          toast.success(
            `${listFields(applied)} updated. ${listFields(requested)} sent to HR to approve — nothing there changes until they do.`,
          );
        } else if (requested.length > 0) {
          toast.success(
            `${listFields(requested)} sent to HR to approve. Nothing changes until they do.`,
          );
        } else if (applied.length > 0) {
          toast.success(`${listFields(applied)} updated.`);
        }
        setFailure(null);
        onApplied();
        return true;
      }

      // The door answered in a shape this app does not know. Say so rather
      // than claiming a save that may not have happened.
      const unknownShape =
        "The change came back in a shape this app does not understand. " +
        "Whether it was saved is not known from here.";
      setFailure({ sentence: unknownShape, technical: null });
      toast.error(unknownShape);
      return false;
    },
    [employeeId, token, onApplied],
  );

  const save = useCallback(
    (field: string, value: unknown) => savePatch({ [field]: value }),
    [savePatch],
  );

  return { saving, rejected, failure, clearFailure, save, savePatch };
}
