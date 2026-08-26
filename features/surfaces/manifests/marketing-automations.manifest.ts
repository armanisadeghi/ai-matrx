/**
 * Surface manifest — Automations, ORGANIZATION / BRAND tier
 * (`matrx-user/marketing-automations`).
 *
 * Drives `/marketing/automations` (`OrganizationRunConsoleMount`) and the
 * per-brand mount at
 * `/marketing/brands/[brandId]/sites/[siteId]/automations` — the SAME
 * component the admin console mounts (`RunConsole`), scoped to the brands one
 * organization controls instead of the whole platform. KI-049: "the same UI
 * that every brand has, with the difference that it only controls their brand."
 *
 * The value vocabulary is shared with the system mount
 * (`matrx-admin/marketing-run-console`) through `_run-console.manifest.ts`.
 * Two surfaces, because the audience and the blast radius differ and therefore
 * so do the agents bound here — a customer's operator is not a platform admin.
 *
 * NO WRITE TARGETS, for the same reason as the admin twin: Run now, the cap
 * and the schedule spend money and change what gets published.
 */

import type { SurfaceAgentRole, SurfaceManifest } from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import { RUN_CONSOLE_GROUPS, RUN_CONSOLE_VALUES } from "./_run-console.manifest";

export const MARKETING_AUTOMATIONS_SURFACE_NAME =
  "matrx-user/marketing-automations";

const agentRoles: SurfaceAgentRole[] = [
  {
    name: "topic_assigner",
    label: "Topic assigner",
    description:
      "The agent a topic-placement pass runs on this organization's brands: it reads the highest-demand unplaced keywords and places them on the Offering tree. Listed here so the work is never anonymous and can be inspected and tested on real evidence.",
    kind: "single",
    defaultAgentId: null,
    mandateKey: "seo.topic_assigner",
    autoRun: "never",
    sortOrder: 100,
  },
];

export const marketingAutomationsManifest: SurfaceManifest = {
  surfaceName: MARKETING_AUTOMATIONS_SURFACE_NAME,
  label: "Automations",
  readiness: "partial",
  readinessNote:
    "Registered 2026-08-25 alongside its admin twin, sharing the run-console vocabulary and emitter. Same outstanding items as matrx-admin/marketing-run-console: the sub-panels' local editor state is undeclared, and Locate anchors plus a live binding test are pending. The per-brand (site tier) mount has not been observed live.",
  urlPattern: "/marketing/automations",
  intro: `<surface_intro>
The work here is running the coverage engines over THIS organization's brands, and reading back what they did. Same console the platform team uses, scoped down: scope_tier is "organization" (every brand this organization controls) or "site" (one brand) — never the whole platform.

The user picks brands, caps how much one pass may do, presses Run now, and inspects the outcome per brand: what was claimed, what was placed, what the engine was unsure about and proposed instead, what it refused to touch because a person had pinned it, and what it quarantined.

engine_mandate_keys names the AI doing this job — an empty list means the pass is pure database work and spends nothing.

READ A ZERO CORRECTLY. Nothing placed is usually one of three different things: the autonomy mode said wait (autonomy_refusals carries the sentence), the daily ceiling was already reached, or there was genuinely no owed work. They mean completely different next steps, so never collapse them.

This surface has no write targets. Explain the run, compare brands, say what should change — the run itself, the cap and the schedule stay with the person, because each one spends money or changes what their site publishes.
</surface_intro>`,
  groups: RUN_CONSOLE_GROUPS,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    RUN_CONSOLE_VALUES,
  ),
  agentRoles,
};
