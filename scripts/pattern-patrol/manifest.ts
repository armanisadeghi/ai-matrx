/**
 * The single machine-readable definition of the Pattern Patrol automation fleet.
 * Prompts, schedules, automation settings, and the registry schedule table are
 * generated from this file; do not copy common contracts into patrol configs.
 */

export type PatrolTier = "M" | "R" | "C/R" | "M/R";

export interface PatrolDefinition {
  patrolId: `P${number}`;
  slug: string;
  job: string;
  automationId: string;
  automationName: string;
  tier: PatrolTier;
  recipePath: string;
  reportSlug: string;
  rrule: string;
  cadence: string;
  runInstruction: string;
}

export interface AutomationUpdateSpec {
  id: string;
  mode: "update";
  kind: "cron";
  name: string;
  prompt: string;
  rrule: string;
  status: "ACTIVE";
  model: "gpt-5.6-sol";
  reasoningEffort: "high";
  executionEnvironment: "worktree" | "local";
  destination: "worktree" | "local";
  projectId: string;
  localEnvironmentConfigPath?: null;
}

export const PATROL_PATHS = {
  repoRoot: "/Users/armanisadeghi/code/matrx-frontend",
  commonDocsRoot:
    "/Users/armanisadeghi/code/common-docs/systems/pattern-patrols",
  automationRoot: "/Users/armanisadeghi/.codex/automations",
  projectId: "local-700fcb138daa8c7b565a2744267dd9b8",
} as const;

export const PATROL_DELIVERY_POLICY = {
  candidateRemoteDeadlineMinutes: 15,
  certifiedMainDeadlineMinutes: 45,
  preProductionFastIntegration: true,
} as const;

export const PATROLS = [
  {
    patrolId: "P1",
    slug: "no-dead-ends",
    job: "No dead ends",
    automationId: "pattern-patrol-p1-no-dead-ends",
    automationName: "Pattern Patrol P1 · No dead ends",
    tier: "M/R",
    recipePath: ".claude/skills/no-dead-ends/SKILL.md",
    reportSlug: "no-dead-ends",
    rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=1;BYMINUTE=10",
    cadence: "Mondays 1:10 AM",
    runInstruction:
      "Fix only skill-approved mechanical EntityRef/token cases. Missing routes, peeks, or judgment-heavy repairs are report-only proposals.",
  },
  {
    patrolId: "P2",
    slug: "inventory-law",
    job: "Inventory law",
    automationId: "pattern-patrol-p2-inventory-law",
    automationName: "Pattern Patrol P2 · Inventory law",
    tier: "C/R",
    recipePath: ".claude/skills/no-dead-ends/SKILL.md",
    reportSlug: "inventory-law",
    rrule: "FREQ=WEEKLY;BYDAY=TU;BYHOUR=0;BYMINUTE=10",
    cadence: "Tuesdays 12:10 AM",
    runInstruction:
      "Catalogue and rank poorer hand-built duplicates and write precise conversion prompts. Fix nothing without item-scoped approval.",
  },
  {
    patrolId: "P3",
    slug: "mobile-friendly-ui",
    job: "Mobile-friendly UI",
    automationId: "pattern-patrol-p3-mobile-friendly-ui",
    automationName: "Pattern Patrol P3 · Mobile-friendly UI",
    tier: "M/R",
    recipePath: ".claude/skills/ios-mobile-first/SKILL.md",
    reportSlug: "mobile-friendly-ui",
    rrule: "FREQ=WEEKLY;BYDAY=MO,TH;BYHOUR=6;BYMINUTE=10",
    cadence: "Mondays and Thursdays 6:10 AM",
    runInstruction:
      "Apply only the registry's literal mechanical viewport/safe-area recipes. Layout judgment remains a manual proposal.",
  },
  {
    patrolId: "P4",
    slug: "light-dark-integrity",
    job: "Light/dark integrity",
    automationId: "pattern-patrol-p4-light-dark-integrity",
    automationName: "Pattern Patrol P4 · Light/dark integrity",
    tier: "M/R",
    recipePath: ".claude/skills/light-dark-integrity/SKILL.md",
    reportSlug: "light-dark-integrity",
    rrule: "FREQ=WEEKLY;BYDAY=TU,FR;BYHOUR=6;BYMINUTE=10",
    cadence: "Tuesdays and Fridays 6:10 AM",
    runInstruction:
      "Apply only mappings authorized by the light/dark skill. Surface intent and every exception remain Arman's decision.",
  },
  {
    patrolId: "P5",
    slug: "copy-everywhere",
    job: "Copy everywhere",
    automationId: "pattern-patrol-p5-copy-everywhere",
    automationName: "Pattern Patrol P5 · Copy everywhere",
    tier: "M/R",
    recipePath: ".claude/skills/agent-copy/SKILL.md",
    reportSlug: "copy-everywhere",
    rrule: "FREQ=WEEKLY;BYDAY=WE;BYHOUR=0;BYMINUTE=10",
    cadence: "Wednesdays 12:10 AM",
    runInstruction:
      "Fix only detector rows classified auto-approved. Review rows become proposals; new primitive or layout work becomes a precise task.",
  },
  {
    patrolId: "P6",
    slug: "no-emojis-in-ui",
    job: "No emojis in UI",
    automationId: "pattern-patrol-p6-no-emojis-in-ui",
    automationName: "Pattern Patrol P6 · No emojis in UI",
    tier: "M/R",
    recipePath: ".claude/skills/no-emojis-in-ui/SKILL.md",
    reportSlug: "no-emojis-in-ui",
    rrule: "FREQ=WEEKLY;BYDAY=WE,SA;BYHOUR=6;BYMINUTE=10",
    cadence: "Wednesdays and Saturdays 6:10 AM",
    runInstruction:
      "Replace verified user-visible emoji only through the skill's Lucide/delete recipes. Ambiguous meaning or state becomes a proposal.",
  },
  {
    patrolId: "P7",
    slug: "no-browser-dialogs",
    job: "No browser dialogs",
    automationId: "pattern-patrol-p7-no-browser-dialogs",
    automationName: "Pattern Patrol P7 · No browser dialogs",
    tier: "M/R",
    recipePath: "CLAUDE.md",
    reportSlug: "no-browser-dialogs",
    rrule: "FREQ=WEEKLY;BYDAY=TH,SU;BYHOUR=6;BYMINUTE=10",
    cadence: "Thursdays and Sundays 6:10 AM",
    runInstruction:
      "Auto-fix only registry-approved standalone alerts. Confirmations, prompts, and control-flow-sensitive alerts require approval.",
  },
  {
    patrolId: "P8",
    slug: "real-loading-states",
    job: "Real loading states",
    automationId: "pattern-patrol-p8-real-loading-states",
    automationName: "Pattern Patrol P8 · Real loading states",
    tier: "M/R",
    recipePath: ".claude/skills/real-loading-states/SKILL.md",
    reportSlug: "real-loading-states",
    rrule: "FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=12;BYMINUTE=10",
    cadence: "Mondays and Fridays 12:10 PM",
    runInstruction:
      "Auto-fix only the exact Suspense fallback recipe. Skeleton choice, layout, and compact non-Suspense states require approval.",
  },
  {
    patrolId: "P9",
    slug: "coming-soon-compliance",
    job: "Coming-soon compliance",
    automationId: "pattern-patrol-p9-coming-soon-compliance",
    automationName: "Pattern Patrol P9 · Coming-soon compliance",
    tier: "R",
    recipePath: "lib/coming-soon/FEATURE.md",
    reportSlug: "coming-soon-compliance",
    rrule: "FREQ=WEEKLY;BYDAY=TH;BYHOUR=0;BYMINUTE=10",
    cadence: "Thursdays 12:10 AM",
    runInstruction:
      "Report and propose only until a standalone detector and bounded interaction proof are operational. Do not mutate product code.",
  },
  {
    patrolId: "P10",
    slug: "type-suppression-debt",
    job: "Type suppression debt",
    automationId: "pattern-patrol-p10-type-suppression-debt",
    automationName: "Pattern Patrol P10 · Type suppression debt",
    tier: "R",
    recipePath: ".claude/skills/type-safety/SKILL.md",
    reportSlug: "type-suppression-debt",
    rrule: "FREQ=WEEKLY;BYDAY=TU,SA;BYHOUR=12;BYMINUTE=10",
    cadence: "Tuesdays and Saturdays 12:10 PM",
    runInstruction:
      "Measure and rank debt. Fix only item-scoped approvals using an already-proven registry recipe; never mass-edit or add a suppression.",
  },
] as const satisfies readonly PatrolDefinition[];

export const FLEET_HEALTH = {
  automationId: "pattern-patrol-fleet-health",
  automationName: "Pattern Patrol Fleet Health",
  rrule: "FREQ=DAILY;BYHOUR=7;BYMINUTE=10",
  cadence: "Daily 7:10 AM",
} as const;

function patrolPrompt(patrol: PatrolDefinition): string {
  const { repoRoot, commonDocsRoot, automationRoot } = PATROL_PATHS;
  return `You are running Pattern Patrol ${patrol.patrolId}-${patrol.slug} in ${repoRoot}.

CANONICAL DEFINITION: scripts/pattern-patrol/manifest.ts owns this automation's id, schedule, tier, recipe, and common contracts. If this prompt disagrees with it, stop and report configuration drift.

READ FIRST:
1. ${commonDocsRoot}/VISION.md
2. ${commonDocsRoot}/FEATURE.md
3. The ${patrol.patrolId} row in ${commonDocsRoot}/PATROL_REGISTRY.md
4. ${repoRoot}/CLAUDE.md
5. ${repoRoot}/.claude/skills/pattern-patrol/SKILL.md
6. ${repoRoot}/${patrol.recipePath}
7. ${repoRoot}/.matrx/PATROL_SIGHTINGS.md
8. ${automationRoot}/${patrol.automationId}/memory.md
9. ${repoRoot}/.matrx/patrol-runs/${patrol.patrolId}/latest.json and ${repoRoot}/.matrx/patrol-reports/${patrol.reportSlug}.md when present

RUN CONTRACT:
- TIER ${patrol.tier}: ${patrol.runInstruction}
- Scope from the registry's structural-novelty recipe plus open sightings and its periodic full pass. Never scope by raw git churn. Route every verified finding to auto-fixed, manual approval requested, or unresolved with the missing evidence.
- WORKTREE ISOLATION: run only in the automation worktree. Capture git status, type-check, and relevant detector diagnostics before editing. Never treat unrelated baseline debt as patrol evidence. Use a real worktree-local offline install when dependencies are absent; never symlink node_modules or expose env contents.
- BASELINE-DELTA CERTIFICATION CONTRACT: every Tier-M batch is at most 15 files and gets a second adversarial agent for the exact candidate. REJECTED requires a concrete new batch-caused defect. Unchanged baseline failures cannot reject. INFRASTRUCTURE BLOCKED preserves and pushes the candidate for retry; never revert valid work because preview, browser, or an unrelated gate failed.
- ENFORCED PREVIEW LEASE: use only pnpm preview:start/status/stop from this exact worktree. Never reuse another worktree's URL. Read the active memory cap from launcher status; a cap termination is infrastructure evidence, not product rejection.
- FAST INTEGRATION CONTRACT: commit every coherent batch immediately and push the candidate to a remote ref within ${PATROL_DELIVERY_POLICY.candidateRemoteDeadlineMinutes} minutes so no work is stranded locally. After independent certification records the exact candidate SHA, integrate and push it to origin/main through the normal fast integration workflow within ${PATROL_DELIVERY_POLICY.certifiedMainDeadlineMinutes} minutes. Direct integration is normal in pre-production; do not wait for a special controller or any repository restriction. Preserve the certified candidate as an ancestor when integrating so its evidence still names real code.
- SERIALIZED RELEASE LANE: deployment and versioned release remain serialized through ./scripts/release.sh. Integration to main is not the release lane. If a newer release already contains the candidate, record that version instead of bumping again.
- PERMANENT RUN RECORD: append lifecycle events through pnpm patrol:run. The hash-chained run record is history; report, memory, inbox, Git ancestry, and release are projections that must agree. A product change must have independent CERTIFIED evidence before integration. Commit and push the run record with the work so other machines receive it.
- LOUD FAILURE CONTRACT: if this patrol cannot perform a required read, scan, approved fix, certification, gate, commit, push, report, or memory update, start the final response with "AUTOMATION DEGRADED — ACTION REQUIRED". State the exact missing step and cause. If Arman must act, end with "ARMAN, WE NEED YOU: <one specific next action>." Never make an incomplete run look clean.
- HUMAN EXCEPTION CONTRACT: an agent may propose an exception but may never clear, suppress, allowlist, or approve one. Keep it open with exact location, reason, stable review artifact, and normal repair. End proposal runs under "EXCEPTION APPROVAL REQUIRED" and ask Arman to approve or reject every item. Only explicit approval creates a typed exception entry and matching source annotation; detectors continue reporting approved exceptions separately.
- RECURSIVE LEARNING: append one concise learning to memory: what this run proved and the smallest detector, skill, test, manifest, or process change that would improve the next run. Deterministic process improvements may be proposed precisely; product taste and expanded fix authority remain Arman's decisions.

FINISH: update sighting outcomes, the permanent record, ${repoRoot}/.matrx/patrol-reports/${patrol.reportSlug}.md, and this automation's memory. Commit promptly and push all owned artifacts. Report findings count, fixed count, certifier verdict, approvals needed, and any degradation. A fully completed zero-finding run is one line.`;
}

export function fleetHealthPrompt(): string {
  const { repoRoot, commonDocsRoot, automationRoot } = PATROL_PATHS;
  return `You are the independent health monitor for the Pattern Patrol fleet. This is orchestration health work, not a product-code patrol.

READ FIRST: ${commonDocsRoot}/VISION.md, FEATURE.md, CODEX_OPERATOR.md, PATROL_REGISTRY.md, ${repoRoot}/scripts/pattern-patrol/manifest.ts, and ${automationRoot}/pattern-patrol-fleet-health/memory.md.

CHECK:
- Run pnpm check:patrol-contracts. The typed manifest owns all patrol ids, schedules, tiers, recipe paths, common prompt contracts, and execution environments. Any live-config or registry drift is a fleet failure.
- Inspect every new active patrol run since memory using Codex task status plus the local automation ledger. Alert on systemError, usage limits, over-two-hour stalls, blank inbox copy, missing/stale report, missing memory, or missing/invalid permanent run record.
- Verify run records with pnpm patrol:run verify. Reports, memory, inbox, Git ancestry, release tags, and deployment must agree with the hash-chained record.
- FAST INTEGRATION IS HEALTH: direct or frequent origin/main integration is normal in pre-production and must never be flagged merely for bypassing a controller. Flag owned candidate commits absent from every remote after ${PATROL_DELIVERY_POLICY.candidateRemoteDeadlineMinutes} minutes, certified candidates absent from origin/main after ${PATROL_DELIVERY_POLICY.certifiedMainDeadlineMinutes} minutes, uncommitted patrol work at task end, or any product change integrated without independent CERTIFIED evidence for its exact ancestor.
- Deployment/version releases remain serialized through release.sh. Run pnpm patrol:delivery:check for release-record consistency, but never recommend slowing or restricting main integration before production readiness.
- Verify exact-worktree preview ownership and the launcher-reported cap. A preview cap event is INFRASTRUCTURE BLOCKED, never REJECTED. Flag cross-worktree reuse, cap enforcement failure, or valid work reverted because proof infrastructure failed.
- Findings in a successful report are not fleet failure. Unchanged baseline debt cannot reject. REJECTED names a concrete batch-caused defect. Human approval and missing machinery are distinct states.
- Never edit product code, another patrol's report, or another patrol's memory. Update only Fleet Health memory with audited ids, evidence, time, and one learning.
- Speak in plain English: name the patrol's job, what happened, the recommendation, and the exact ask.

RESPONSE: if clean, write "PATTERN PATROL FLEET HEALTHY — <number> new runs checked." If unhealthy, begin "AUTOMATION DEGRADED — ACTION REQUIRED", give one terse bullet per failed patrol with job and task id, and end "ARMAN, WE NEED YOU: review the named failed patrol tasks and restore the stated prerequisite." Never make failed or incomplete work look clean.`;
}

export function automationUpdateSpecs(): AutomationUpdateSpec[] {
  const base = {
    mode: "update" as const,
    kind: "cron" as const,
    status: "ACTIVE" as const,
    model: "gpt-5.6-sol" as const,
    reasoningEffort: "high" as const,
    projectId: PATROL_PATHS.projectId,
  };
  return [
    ...PATROLS.map((patrol) => ({
      ...base,
      id: patrol.automationId,
      name: patrol.automationName,
      prompt: patrolPrompt(patrol),
      rrule: patrol.rrule,
      executionEnvironment: "worktree" as const,
      destination: "worktree" as const,
      localEnvironmentConfigPath: null,
    })),
    {
      ...base,
      id: FLEET_HEALTH.automationId,
      name: FLEET_HEALTH.automationName,
      prompt: fleetHealthPrompt(),
      rrule: FLEET_HEALTH.rrule,
      executionEnvironment: "local" as const,
      destination: "local" as const,
    },
  ];
}

export function registryScheduleTable(): string {
  const rows = PATROLS.map(
    (patrol) =>
      `| ${patrol.patrolId} | ${patrol.job} | ${patrol.tier} | ${patrol.cadence} | \`${patrol.automationId}\` |`,
  );
  return [
    "<!-- GENERATED: PATROL_MANIFEST_SCHEDULES START -->",
    "| Patrol | Job | Operating tier | Schedule | Automation |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    `| Health | Fleet health | Read-only | ${FLEET_HEALTH.cadence} | \`${FLEET_HEALTH.automationId}\` |`,
    "<!-- GENERATED: PATROL_MANIFEST_SCHEDULES END -->",
  ].join("\n");
}
