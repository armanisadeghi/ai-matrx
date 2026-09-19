// lib/knobs/toolKnobGating.ts
//
// A TOOL AN ORGANIZATION DOES NOT HAVE IS NOT IN ITS PICKER.
//
// WHY THIS EXISTS. On 2026-09-19 the independent verifier found that **no agent on the
// platform carried the `records` tool** — it was registered and active, and a person could
// not ask any agent to touch their own records. The server half of the fix makes the tool
// an ambient default for an organization whose record store is on
// (`aidream/services/tooling/tool_merge.py::ORG_KNOB_DEFAULT_TOOLS`). This is the other
// half: the agent builder's tool picker must show it in exactly the organizations that
// have it, and never anywhere else.
//
// THE PICKER HAD NO ELIGIBILITY AT ALL. `fetchAvailableTools` reads every
// `tool.definition` row with `is_active = true` and shows the lot. For most tools that is
// right — they are platform-wide. It is wrong for a tool an organization may not have
// turned on: offering `records` to an organization whose store is off would put a control
// on the screen whose every action answers "the custom data store is switched off", which
// is the dead-control shape the platform forbids. Absent is honest; present-and-refusing
// is not.
//
// ONE DECLARATION, READ BY BOTH SIDES. The pairs below are the SAME pairs the server's
// default-set injection reads. A tool listed here is offered only where every one of its
// knobs resolves true for the signed-in person's organization, so the screen and the turn
// can never disagree about what an organization has.
//
// HOW TO ADD ONE. Put the tool's name and the knob pair(s) it needs in `TOOL_ORG_KNOBS`,
// and add the same row to `ORG_KNOB_DEFAULT_TOOLS` in aidream if the tool should also be
// an ambient default. Nothing else changes: every other tool keeps flowing through
// unfiltered.

import {
  ensureEffectiveKnob,
  type KnobAddress,
} from "@/lib/scoped-config/effectiveKnobs";

/** Tool name → every organization knob that must resolve true for it to be offered. */
export const TOOL_ORG_KNOBS: Readonly<Record<string, readonly KnobAddress[]>> = {
  records: [
    // Is this organization's custom data store open at all?
    { feature: "custom", key: "system_enabled" },
    // And when it is, do its agents get the tool without attaching it by hand?
    { feature: "custom", key: "records_tool_default" },
  ],
};

/** The tools this module has an opinion about. Everything else is always offered. */
export function isOrgKnobGatedTool(name: string | null | undefined): boolean {
  return Boolean(name && name in TOOL_ORG_KNOBS);
}

type NamedTool = { name?: string | null };

/**
 * The subset of `tools` this organization may see.
 *
 * A knob that cannot be resolved is NOT read as "on": an unreadable switch never hands
 * out a capability, and the reason is logged rather than swallowed. With no organization
 * (a signed-out or org-less session) a gated tool is withheld for the same reason —
 * nothing resolves an organization knob without an organization.
 */
export async function filterToolsByOrgKnobs<T extends NamedTool>(
  tools: readonly T[],
  organizationId: string | null | undefined,
  userId: string | null | undefined,
): Promise<T[]> {
  const gated = tools.filter((tool) => isOrgKnobGatedTool(tool?.name));
  if (gated.length === 0) return [...tools];
  if (!organizationId) {
    return tools.filter((tool) => !isOrgKnobGatedTool(tool?.name));
  }

  const allowed = new Map<string, boolean>();
  await Promise.all(
    Array.from(new Set(gated.map((tool) => String(tool.name)))).map(async (name) => {
      const refs = TOOL_ORG_KNOBS[name] ?? [];
      try {
        const values = await Promise.all(
          refs.map((ref) => ensureEffectiveKnob(organizationId, userId ?? null, ref)),
        );
        allowed.set(name, values.every((value) => value === true));
      } catch (error) {
        console.warn(
          `[toolKnobGating] "${name}" is not offered: a knob it depends on could not be ` +
            `resolved for this organization (${String(error)}). Nothing was shown; ` +
            "nothing failed silently.",
        );
        allowed.set(name, false);
      }
    }),
  );

  return tools.filter(
    (tool) => !isOrgKnobGatedTool(tool?.name) || allowed.get(String(tool.name)) === true,
  );
}
