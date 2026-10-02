// lib/knobs/toolKnobGating.ts
//
// A TOOL AN ORGANIZATION DOES NOT HAVE IS NOT IN ITS PICKER.
//
// WHY THIS EXISTS. A tool an organization may not have turned on must not be offered as if it
// worked: a control whose every action answers "switched off" is the dead-control shape the
// platform forbids. `TOOL_ORG_KNOBS` names such tools and the organization knobs that must all
// resolve true; every other tool flows through unfiltered.
//
// EMPTY SINCE 2026-10-02. `records` was the only entry, tied to the knob
// custom/records_tool_default and the agent INSERT seed `agent.org_default_tool`. The owner
// removed both ("Remove the database rule"): the platform never adds a tool on its own, and
// `records` is offered like any other tool (matrx-frontend migration
// records_a_new_agent_is_never_seeded_with_a_tool.sql).
//
// HOW TO ADD ONE. Put the tool's name and the knob pair(s) it needs in `TOOL_ORG_KNOBS`.

import {
  ensureEffectiveKnob,
  type KnobAddress,
} from "@/lib/scoped-config/effectiveKnobs";

/** Tool name → every organization knob that must resolve true for it to be offered. */
export const TOOL_ORG_KNOBS: Readonly<Record<string, readonly KnobAddress[]>> = {};

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

/**
 * The names of the tools in `tools` that are NOT available in `organizationId` — the organization
 * an agent RUNS in (the agent's own, never the active one). A picker shows every tool and marks
 * these; it does not hide them. Same resolution (and same fail-closed reading of an unreadable
 * knob) as `filterToolsByOrgKnobs`.
 */
export async function toolsWithheldInOrganization<T extends NamedTool>(
  tools: readonly T[],
  organizationId: string | null | undefined,
  userId: string | null | undefined,
): Promise<Set<string>> {
  const offered = await filterToolsByOrgKnobs(tools, organizationId, userId);
  const offeredNames = new Set(offered.map((tool) => String(tool.name)));
  return new Set(
    tools
      .filter((tool) => isOrgKnobGatedTool(tool?.name) && !offeredNames.has(String(tool.name)))
      .map((tool) => String(tool.name)),
  );
}
