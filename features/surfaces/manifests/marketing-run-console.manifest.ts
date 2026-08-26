/**
 * Surface manifest — Run console, SYSTEM tier (`matrx-admin/marketing-run-console`).
 *
 * ADMIN SURFACE. Drives `/administration/marketing/run-console`
 * (`app/(admin)/administration/marketing/run-console/page.tsx` →
 * `features/marketing/seo/run-console/RunConsole.tsx` with `scope.tier =
 * "system"` — every brand on the platform).
 *
 * WHY IT EXISTS AS A SURFACE (Arman, 2026-08-25): this console RUNS an agent
 * from a button in its own UI, and until now it was not registered at all — so
 * the Agents menu could not name it, nobody could bind a second agent to look
 * at the same evidence, and there was nowhere to leave a note about how the
 * job went. THE DISCLOSURE LAW: a surface that runs AI names it, in the page
 * AND in the menu.
 *
 * The value vocabulary is shared with the organization/brand mount
 * (`matrx-user/marketing-automations`) through `_run-console.manifest.ts` —
 * ONE component, one vocabulary, two audiences.
 *
 * NO WRITE TARGETS, deliberately. Everything this console does costs money or
 * changes what the platform publishes: Run now, the per-brand cap, and the
 * unattended schedule all stay human. An agent bound here reads the run and
 * reasons about it.
 */

import type { SurfaceAgentRole, SurfaceManifest } from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import { RUN_CONSOLE_GROUPS, RUN_CONSOLE_VALUES } from "./_run-console.manifest";

export const MARKETING_RUN_CONSOLE_SURFACE_NAME =
  "matrx-admin/marketing-run-console";

/**
 * The engine's own agent, named as a ROLE so it is listed, inspectable and
 * runnable from the Agents menu with this page's live scope — the surface half
 * of what `<PageAgents>` discloses inline.
 *
 * `mandateKey`, never a UUID: the agent behind the job is DB-managed and moves
 * without a deploy (the NO HARDCODED AGENTS law).
 */
const agentRoles: SurfaceAgentRole[] = [
  {
    name: "topic_assigner",
    label: "Topic assigner",
    description:
      "The agent a topic-placement pass runs: it reads a brand's highest-demand unplaced keywords and places them on the Offering tree. Listed here so an operator can inspect it, test it against this console's live evidence, and leave notes on how it is doing.",
    kind: "single",
    defaultAgentId: null,
    mandateKey: "seo.topic_assigner",
    autoRun: "never",
    sortOrder: 100,
  },
];

export const marketingRunConsoleManifest: SurfaceManifest = {
  surfaceName: MARKETING_RUN_CONSOLE_SURFACE_NAME,
  label: "Run console",
  readiness: "partial",
  readinessNote:
    "Registered 2026-08-25 with the shared run-console vocabulary, the topic-assigner role bound by mandate key, and emitters on both engine bodies. Not yet verified: the sub-panels' own state (schedule cascade editor fields, run-history filters, the Proposals/Not-placed queues' internals) is deliberately undeclared for now — the console declares the schedule ROWS and the outcomes it owns, not those panels' local editor state. Locate anchors and a live non-matching-name binding test are still outstanding.",
  urlPattern: "/administration/marketing/run-console",
  intro: `<surface_intro>
This is an ADMIN surface: the Run console at the SYSTEM tier, which governs EVERY brand on the platform. The same console mounts for one organization's brands elsewhere — read scope_tier before you say anything about blast radius.

The work here is driving keyword-coverage engines by hand and then poking holes in what they did. An operator picks brands, caps how much one pass may do, presses Run now, and reads back what the engine claimed, placed, proposed, protected and quarantined.

active_engine_slug tells you which engine is on screen; the engines genuinely differ, and only the mounted one's values are emitted. engine_mandate_keys names the AI this engine runs — an empty list means the pass is pure database work that spends nothing, never "unknown".

READ A ZERO CORRECTLY. A pass that placed nothing is usually one of three things, and they are not the same: the autonomy mode declined to write (autonomy_refusals says so, in a sentence), the daily ceiling was already reached (the outcome carries it), or there genuinely was no owed work. Never report an autonomy refusal as "nothing to place".

Knobs are the ceiling and the console refuses to guess one: cap_ceiling of zero means the knob row is MISSING and the console will not run at all.

Everything here is evidence and this surface has no write targets. Reason about the run, compare brands, explain an outcome, draft what should change — but Run now, the cap and the schedule are a person's call, because each of them spends money or changes what the platform publishes.
</surface_intro>`,
  groups: RUN_CONSOLE_GROUPS,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    RUN_CONSOLE_VALUES,
  ),
  agentRoles,
};
