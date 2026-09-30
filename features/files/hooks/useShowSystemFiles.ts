"use client";

/**
 * useShowSystemFiles — the ONE reader and writer of the Feature Knob
 * `files.show_system_files` (default OFF; the organization and the person may
 * override it).
 *
 * A system file is one the system made and marked as its own
 * (`metadata.system_artifact`): page captures, provider payloads, crawl output,
 * saved record values. Every file list shows them only while this is on
 * (`isListedFile` / `isListedFolderPath` in `features/files/utils/user-visible.ts`);
 * Recents never shows them either way (Arman, 2026-09-29).
 *
 * `canToggle` is true only when the knob lets THIS person set their own value
 * in their active organization (the person rung is overridable and the
 * organization has not locked it). A person's value is kept per organization,
 * like every person-rung knob, so with no active organization there is nothing
 * to write and the control is absent — never a dead switch.
 */

import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import {
  fetchKnobDefinition,
  knobRefusalSentence,
  setKnobOverride,
} from "@/lib/scoped-config/service";

export const SHOW_SYSTEM_FILES_KNOB = {
  feature: "files",
  key: "show_system_files",
} as const;

export interface ShowSystemFiles {
  /** The effective value; `false` until the snapshot answers (the default). */
  showSystemFiles: boolean;
  /** True when this person may set their own value here. */
  canToggle: boolean;
  /** Writes the person's own value in their active organization. */
  setShowSystemFiles: (next: boolean) => Promise<void>;
}

export function useShowSystemFiles(): ShowSystemFiles {
  const userId = useAppSelector((s) => s.userAuth?.id ?? null);
  const organizationId = useAppSelector(selectOrganizationId);
  const value = useEffectiveKnob(organizationId, userId, SHOW_SYSTEM_FILES_KNOB);
  const [canToggle, setCanToggle] = useState(false);

  useEffect(() => {
    if (!organizationId || !userId) {
      setCanToggle(false);
      return;
    }
    let live = true;
    void fetchKnobDefinition({
      organizationId,
      userId,
      feature: SHOW_SYSTEM_FILES_KNOB.feature,
      key: SHOW_SYSTEM_FILES_KNOB.key,
    })
      .then((knob) => {
        if (!live) return;
        setCanToggle(
          !!knob &&
            !knob.platform_locked &&
            !knob.user_override_locked &&
            knob.overridable_by.includes("user"),
        );
      })
      .catch((error: unknown) => {
        console.error(
          "[files] could not read whether you may change 'Show system files' — the switch stays hidden until it can:",
          error,
        );
        if (live) setCanToggle(false);
      });
    return () => {
      live = false;
    };
  }, [organizationId, userId]);

  const setShowSystemFiles = useCallback(
    async (next: boolean) => {
      if (!userId || !organizationId) {
        throw new Error("Show system files is saved per organization; choose an organization first.");
      }
      const result = await setKnobOverride({
        feature: SHOW_SYSTEM_FILES_KNOB.feature,
        key: SHOW_SYSTEM_FILES_KNOB.key,
        scopeKind: "user",
        scopeId: userId,
        organizationId,
        value: next,
        note: "Show system files switch in the Files list",
      });
      if (!result.ok) {
        throw new Error(`Show system files was not saved: ${knobRefusalSentence(result)}`);
      }
    },
    [userId, organizationId],
  );

  return { showSystemFiles: value === true, canToggle, setShowSystemFiles };
}
