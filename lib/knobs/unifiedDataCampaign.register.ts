// lib/knobs/unifiedDataCampaign.register.ts
//
// THE REGISTER of unified-data campaign code paths — and NOTHING ELSE.
//
// WHY IT IS ITS OWN FILE. `pnpm check:campaign-entry-points` has to read this
// list, and a guard must be able to run in a bare checkout with no database
// identity in the environment. Its sibling `unifiedDataCampaign.ts` imports
// `featureKnobs`, which builds a Supabase client at module load and THROWS
// without `NEXT_PUBLIC_SUPABASE_URL` — so a guard that imported the switch
// could never run. Splitting the data out keeps ONE source of truth (the
// switch re-exports every symbol below) and leaves the guard side-effect-free.

/**
 * WHAT COUNTS AS AN ENTRY POINT, AND THE THREE KINDS.
 *
 * "The campaign store" is the four `platform.custom_*` tables the unified-data
 * campaign introduces — `custom_entity_definition`, `custom_field_definition`,
 * `custom_field_target`, `custom_record` — plus the campaign's own modules
 * (`unifiedDataCampaign.ts` + this register, `scripts/lib/migration-target.ts`,
 * `scripts/gate-corpus/*`).
 *
 * THE RULE, enforced by `pnpm check:campaign-entry-points`: every file in this
 * repo that reaches the campaign store or imports a campaign module MUST appear
 * below. An unregistered one fails the guard by name. Registration is not a
 * rubber stamp — the `kind` decides what else is demanded of the file:
 *
 *   · `runtime`     — code the Next.js app serves to a user. It MUST import
 *                     this module and call `UNIFIED_DATA_CAMPAIGN.enabled()`,
 *                     because a `release*:` commit by ANY lane ships it.
 *   · `tooling`     — a script a human runs by hand (`scripts/**`). It ships to
 *                     no user, so it must NOT be gated: gating it would make
 *                     the campaign's own migration runner refuse to run until
 *                     the campaign it is preparing was already switched on.
 *   · `preexisting` — code that read those tables BEFORE the campaign existed
 *                     and is live in production today. Gating it would TURN OFF
 *                     a shipped feature. It is registered so the guard can tell
 *                     it apart from new campaign code, never to be switched.
 */
export type CampaignEntryPointKind = "runtime" | "tooling" | "preexisting";

export interface CampaignEntryPoint {
    /** Stable id, for the guard's failure message. */
    id: string;
    /** Repo-relative path to the module that owns the entry point. */
    file: string;
    /** Which of the three rules above applies to this file. */
    kind: CampaignEntryPointKind;
    /** Why it is on the list, in one sentence. Never blank. */
    why: string;
}

/**
 * Module specifiers that identify an import of campaign code. Matched against
 * the RESOLVED path of every import in the repo, so `"./lib/migration-target"`,
 * `"../lib/migration-target"` and `"@/lib/knobs/unifiedDataCampaign"` are all
 * the same fact.
 */
export const CAMPAIGN_MODULES: readonly string[] = [
    "lib/knobs/unifiedDataCampaign",
    "scripts/lib/migration-target",
    "scripts/gate-corpus/",
];

/** The campaign's new store. A `.from("…")` on any of these is reach. */
export const CAMPAIGN_STORE_TABLES: readonly string[] = [
    "custom_entity_definition",
    "custom_field_definition",
    "custom_field_target",
    "custom_record",
];

/**
 * THE REGISTER — census taken 2026-09-15 against the working tree.
 *
 * READ THIS BEFORE YOU READ THE LIST: there are ZERO `runtime` entries. Not one
 * line of campaign code is served to a user by this repo today, so the switch
 * above currently guards nothing — and that is the honest state, not an
 * oversight. The list is NOT empty, because the campaign does already own
 * developer tooling and does already sit beside live pre-campaign readers, and
 * a register that showed nothing at all would read as "nothing to check" when
 * the guard has real files to police. The FIRST campaign UI route, nav entry,
 * server action or hook a lane writes is a `runtime` entry, and the guard fails
 * until it is both registered here and calling `UNIFIED_DATA_CAMPAIGN.enabled()`.
 *
 * Files deliberately NOT registered, and why (the other half of the census):
 *   · `types/database.types.ts`, `features/matrx-envelope/catalog-nouns.generated.ts`,
 *     `features/settings/universal/knobDatabaseConsumers.generated.ts` —
 *     GENERATED schema descriptions. They name the tables; they reach nothing.
 *   · `utils/permissions/registry.ts` — declares the resource types so the
 *     access layer can answer about them. A declaration, not a read.
 *   · `lib/coming-soon/registry.ts`, `features/hr/FEATURE.md` — prose mentions.
 *   · `migrations/*.sql` — DDL, governed by the migration runner and its
 *     `-- target:` header, not by a code-side switch.
 *   · `scripts/check-hr-custom-field-targets.ts`,
 *     `lib/knobs/unifiedDataCampaign.test.ts`,
 *     `scripts/check-campaign-entry-points.ts` — guards and tests ABOUT the
 *     campaign. Gating a guard on the thing it guards is a guard that stops
 *     guarding.
 */
export const ENTRY_POINTS: readonly CampaignEntryPoint[] = [
    {
        id: "migration-target",
        file: "scripts/lib/migration-target.ts",
        kind: "tooling",
        why: "Decides whether a DDL file may land on the campaign's rehearsal branch or on production. Run by a human; gating it would make the campaign unable to prepare itself.",
    },
    {
        id: "apply-migration",
        file: "scripts/apply-migration.ts",
        kind: "tooling",
        why: "THE migration runner (`pnpm db:apply`); imports migration-target for the --target refusal. Never part of a served request.",
    },
    {
        id: "check-migrations",
        file: "scripts/check-migrations.ts",
        kind: "tooling",
        why: "Reads migration `-- target:` headers through migration-target. A guard, run by hand and at release time.",
    },
    {
        id: "gate-corpus-run",
        file: "scripts/gate-corpus/run.ts",
        kind: "tooling",
        why: "Seeds and asserts the switch-gate corpus on a throwaway Supabase branch. Refuses production outright; ships to no user.",
    },
    {
        id: "gate-corpus-restore-graph",
        file: "scripts/gate-corpus/restore-graph.ts",
        kind: "tooling",
        why: "Restores production's association graph onto the rehearsal branch. Branch-only tooling.",
    },
    {
        id: "migration-target-refusals-test",
        file: "scripts/__tests__/migration-target-refusals.test.ts",
        kind: "tooling",
        why: "Jest proof of the --target header refusals (ATTACK-4 findings 3/4, ATTACK-5 findings 3/4). Pure header checks, no database, no credential; never part of a served request.",
    },
    {
        id: "gate-corpus-cron-pause-guard",
        file: "scripts/gate-corpus/cron-pause-guard.ts",
        kind: "tooling",
        why: "`pnpm check:cron-pause` — reads production's cron.job (SELECT only) and ledgers what it saw on the rehearsal branch. Imports migration-target for the branch identity. A guard, run by hand and by the chair's loop.",
    },
    {
        id: "gate-corpus-capture-go-signal",
        file: "scripts/gate-corpus/capture-go-signal.ts",
        kind: "tooling",
        why: "`pnpm db:capture-go-signal` — rule 30's go-signal capture producer (ATTACK-6 finding 6). Reads production SELECT-only inside a `begin read only`, writes campaign_watch.go_signal_capture on the rehearsal branch. Imports migration-target for the branch identity. Run by the chair; never part of a served request.",
    },
    {
        id: "gate-corpus-boundary-verdict",
        file: "scripts/gate-corpus/boundary-verdict.ts",
        kind: "tooling",
        why: "restore-graph --verify's per-table verdict, extracted so it can be tested without running the copy (ATTACK-6 finding 7). Pure arithmetic, no database.",
    },
    {
        id: "restore-graph-boundary-floor-test",
        file: "scripts/__tests__/restore-graph-boundary-floor.test.ts",
        kind: "tooling",
        why: "Jest proof that the recorded boundary is a FLOOR and not an equality, so --verify does not turn red at H+19.75 (ATTACK-6 finding 7). No database, no credential.",
    },
    {
        id: "restore-graph-boundary-age-test",
        file: "scripts/__tests__/restore-graph-boundary-age.test.ts",
        kind: "tooling",
        why: "Jest proof of the copy's freshness ceiling — the 12 h boundary age W7-GATE breaches at H+49 (ATTACK-7 finding 6/14). No database, no credential.",
    },
    {
        id: "db-objects-diff",
        file: "scripts/db-objects-diff.ts",
        kind: "tooling",
        why: "pnpm db:objects-diff — W0-TGT-FE's named object-level diff of branch against production, inside a read-only transaction (ATTACK-7 finding 7.1). A script a human runs; it serves nothing.",
    },
    {
        id: "gate-corpus-branch-api",
        file: "scripts/gate-corpus/branch-api.ts",
        kind: "tooling",
        why: "The rehearsal branch's API layer — pgrst.db_schemas, production's grants, and the branch-only grant/expose of the campaign's schema (ATTACK-8 finding 2). A script a human runs against the BRANCH; it refuses production twice and serves nothing to a user.",
    },
    {
        id: "gate-corpus-seed-contract",
        file: "scripts/gate-corpus/seed-contract.ts",
        kind: "tooling",
        why: "The file-shape checkers that keep seed.sql and run.ts able to coexist with W0-DATA's restore (ATTACK-8 findings 1 and 3). Pure string judgment, no database.",
    },
    {
        id: "gate-corpus-seed-contract-test",
        file: "scripts/__tests__/gate-corpus-seed-contract.test.ts",
        kind: "tooling",
        why: "Jest proof of that contract, RED against the files as they stood at 3027f152d5. No database, no credential.",
    },
    {
        id: "hr-settings-service",
        file: "features/hr/settings/service.ts",
        kind: "preexisting",
        why: "Live HR v1 reader of platform.custom_field_definition / custom_field_target — shipped and in use before this campaign. Gating it would switch OFF a working feature.",
    },
    {
        id: "gate-corpus-identity-shell-test",
        file: "scripts/__tests__/gate-corpus-identity-shell.test.ts",
        kind: "tooling",
        why: "Jest proof of restore-graph.ts's auth.users id-only-shell and auth-wide secret deny-list checks (the chair's 2026-09-16 ruling). No database, no credential; never part of a served request.",
    },
    {
        id: "gate-corpus-refuses-production-identity-test",
        file: "scripts/__tests__/gate-corpus-refuses-production-identity.test.ts",
        kind: "tooling",
        why: "Jest proof that both gate-corpus runners refuse a connection whose pg_control_system().system_identifier is production's (ATTACK-9 finding 34). Reads plan/BRANCH-REF and two source files; opens no socket, holds no credential, never part of a served request.",
    },
];

/**
 * The entries the switch is actually responsible for. EMPTY TODAY, on purpose:
 * see the register above. `check:campaign-entry-points` demands that each of
 * these imports this module and calls `enabled()`.
 */
export const RUNTIME_ENTRY_POINTS: readonly CampaignEntryPoint[] =
    ENTRY_POINTS.filter((entry) => entry.kind === "runtime");

