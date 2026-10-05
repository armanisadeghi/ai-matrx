// packages/chat/src/agents/redux/execution-system/instance-resources/remark-knob.ts
//
// `chat.remarks.auto_include_interactions` (platform.feature_knob, default ON,
// overridable by organization and person): whether an edit to an answer, a
// decision choice, questionnaire answers or a shape interaction stages a remark
// chip by itself. Comments have their own switch (selection_toolbar).

import { ensureEffectiveKnob } from "../../../../host/prefs";
import { getUserId } from "../../../../host/identity";
import { selectActiveOrganizationId } from "../../../../context/sources/scopes";
import type { ChatRootState } from "../../../../store/root-state";

export const REMARKS_AUTO_INCLUDE_KNOB = {
  feature: "chat.remarks",
  key: "auto_include_interactions",
} as const;
/** The seeded default, used while the knob cannot be read (and said so). */
export const REMARKS_AUTO_INCLUDE_DEFAULT = true;

export async function remarksAutoIncludeEnabled(getState: () => ChatRootState): Promise<boolean> {
  try {
    const value = await ensureEffectiveKnob(
      selectActiveOrganizationId(getState()) ?? null,
      getUserId() ?? null,
      REMARKS_AUTO_INCLUDE_KNOB,
    );
    return typeof value === "boolean" ? value : REMARKS_AUTO_INCLUDE_DEFAULT;
  } catch (error) {
    console.error(
      `[remarks] ${REMARKS_AUTO_INCLUDE_KNOB.feature}.${REMARKS_AUTO_INCLUDE_KNOB.key} could not be read; ` +
        `using its default (${REMARKS_AUTO_INCLUDE_DEFAULT}).`,
      error,
    );
    return REMARKS_AUTO_INCLUDE_DEFAULT;
  }
}
