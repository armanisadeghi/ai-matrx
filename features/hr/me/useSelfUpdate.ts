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
} from "./selfServicePolicy";

export type HrSelfUpdateState = {
  saving: boolean;
  /** Field keys the server refused, with WHY, kept for inline rendering. */
  rejected: { field: string; policy: string }[];
  save: (field: string, value: unknown) => Promise<void>;
  savePatch: (patch: Record<string, unknown>) => Promise<void>;
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

  const savePatch = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!employeeId) return;
      setSaving(true);
      const result = await updateHrSelf({ token, id: employeeId, patch });
      setSaving(false);

      if (!result.ok) {
        // A DENIED envelope here means the self lane itself refused — a
        // terminated person, a record that is not theirs. Not a field problem.
        toast.error(
          result.kind === "denied"
            ? result.detail?.trim() ||
                "That change is not something you can make here."
            : result.message,
        );
        return;
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
        toast.error(parts.join(" "));
        return;
      }

      setRejected([]);

      if (isSelfUpdateAck(payload)) {
        const applied = payload.applied ?? [];
        const requested = payload.requested ?? [];

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
        onApplied();
        return;
      }

      // The door answered in a shape this app does not know. Say so rather
      // than claiming a save that may not have happened.
      toast.error(
        "The change came back in a shape this app does not understand. Reload and check whether it was saved.",
      );
    },
    [employeeId, token, onApplied],
  );

  const save = useCallback(
    (field: string, value: unknown) => savePatch({ [field]: value }),
    [savePatch],
  );

  return { saving, rejected, save, savePatch };
}
