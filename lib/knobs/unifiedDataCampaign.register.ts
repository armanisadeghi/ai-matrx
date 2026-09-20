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
export type CampaignEntryPointKind =
    | "runtime"
    | "tooling"
    | "preexisting"
    /**
     * THE ONE LINE, AND NOTHING ELSE. A standard entity page that carries
     * `<EntityCustomFields entityToken="…" />` (SCR-12 / REC-40) and no campaign
     * logic of its own: the switch is read INSIDE that component, once, so the
     * page names a token and nothing more. It is its own kind because `runtime`
     * means "this file reads the gate" and these files deliberately do not —
     * calling them `runtime` would make the guard demand a gate call that must
     * not be there, and calling them `preexisting` would hide that they are the
     * campaign's own surface.
     *
     * Added 2026-09-20: lane ENTITY-FIELDS registered three rows with this word
     * and never added it to the union, so `pnpm type-check` was red on main with
     * three TS2322 while `check:campaign-entry-points` was green — the guard
     * reads the rows, the compiler reads the type, and only one of them was
     * being told.
     */
    | "one_line"
    /**
     * A RED TWIN: a test that wires the campaign's own gate the WRONG way on
     * purpose, asserts the world before its lane's fix, and is SUPPOSED to fail.
     * It is the only kind other than `runtime` allowed to call the gate — a red
     * twin that could not call it could not be a twin of anything.
     *
     * The guard holds it to its name: the file must end `.red.test.ts(x)`, so the
     * word cannot be used to walk served code past the `runtime` rule. Registered
     * because lane APPROVAL-KNOB found `check:campaign-entry-points` exiting 1 on
     * origin/main: NAV-FIX had added the first red twin in this repo and the
     * register had no word for one, so the only ways to green were to mis-declare
     * it or to delete somebody's guard.
     */
    | "red_twin"
    /**
     * DOOR-GATED: served code that reaches the store through a door which reads
     * the switch ITSELF, for the organization the subject belongs to, because
     * there is no person here to read it for.
     *
     * The public form (PRODUCTS row 1 / DOOR-17) is the first of these and the
     * reason the word exists. A page served to somebody with NO ACCOUNT cannot
     * call `UNIFIED_DATA_CAMPAIGN.enabled(organizationId)`: it has no signed-in
     * person, no organization the caller may name, and asking the switch for a
     * caller who has none would answer the platform default (false) for every
     * organization on earth, including the ones that ARE on. The switch is read
     * one layer down instead, inside `custom.form_public` / `custom.form_submit`,
     * via `custom.store_is_open(organization_id)` — for the organization the FORM
     * belongs to, which is the only correct one — and a form whose store is off
     * answers with zero rows, which the page renders as a 404.
     *
     * THIS IS STRICTLY STRONGER THAN THE `runtime` RULE, not an exemption from
     * it: a client-side gate can be bypassed by calling the door directly, and
     * this one cannot, because it is the door. The guard holds the kind to its
     * name — the register's `why` must NAME the door that does the reading, so
     * "door_gated" can never become a way to ship code that reads no switch at
     * all.
     */
    | "door_gated";

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
    // The campaign's two packages. A file that imports either one is reaching
    // the unified record store — the store client and the canonical screens —
    // exactly as surely as a `.from("custom_record")`, so it is reach and it
    // must be registered. Bare specifiers, matched by name.
    "@ai-matrx/records",
    "@ai-matrx/records-ui",
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
 * READ THIS BEFORE YOU READ THE LIST: the first three `runtime` entries landed
 * on 2026-09-18 — the two `/data-v2` route files and the CRM record page's
 * custom-fields section. Every one of them is served to users on any lane's
 * `release*:` commit, so every one of them reads the switch: the guard fails
 * unless a `runtime` file both appears here and calls
 * `UNIFIED_DATA_CAMPAIGN.enabled()`. The rest of the list is developer tooling
 * and the live pre-campaign readers the guard must be able to tell apart from
 * campaign code.
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
    id: "record-scoped-chat",
    file: "features/unified-data/record-chat/RecordScopedChat.tsx",
    kind: "runtime",
    why:
      "AGT-N-9 / PRODUCTS row 11 — the host's `chat` port. The package builds a record's " +
      "SCOPE through one door and hands it here; this renders the platform's ONE chat " +
      "column (AgentConversationColumn) bound to that record through conversationScopeBind, " +
      "with the scope chip, the suggested questions the record's own shape produced and the " +
      "sentence naming any Field the store withheld. Served to users, so it reads the switch " +
      "and shows the off sentence when it is off.",
  },
    {
        id: "public-form-page",
        file: "app/(link)/f/[formId]/page.tsx",
        kind: "door_gated",
        why: "PRODUCTS row 1. The public form at its unguessable link, server-rendered for somebody with NO ACCOUNT. It does NOT read the campaign switch the way a signed-in page does — there is no person to read it for and no organization the caller may name. The switch is asked INSIDE custom.form_public, for the organization the form itself belongs to, and a form whose store is off answers with zero rows, which is the 404. The browser never holds a store client: the Fields come from the server and the answers go to the route handler below.",
    },
    {
        id: "public-form-runner",
        file: "app/(link)/f/[formId]/PublicFormRunner.tsx",
        kind: "door_gated",
        why: "PRODUCTS row 1. The one client island on the public form page: it mounts @ai-matrx/records-ui's FormRunner in its PUBLIC arm, which takes the server-resolved Fields and a submit port and builds no record-store client at all. Everything it knows came through custom.form_public, and everything it sends goes to custom.form_submit — both of which read custom/system_enabled themselves, through custom.store_is_open and custom.assert_store_door, for the organization the form belongs to. This file holds no key and can reach no door on its own.",
    },
    {
        id: "public-form-submit",
        file: "app/api/forms/[formId]/submit/route.ts",
        kind: "door_gated",
        why: "PRODUCTS row 1 / DOOR-17. Where a stranger's answer arrives. It adds the three things a browser cannot be trusted for — the real Origin header, a coarse client identifier for the rate limit, and lifting the honeypot out of the answers — and hands everything else to custom.form_submit, which decides published, closed, full, the cap, the window, every exposed key and every required answer. The switch is that door's own assert_store_door.",
    },
    {
        id: "public-form-service",
        file: "features/forms/service.ts",
        kind: "door_gated",
        why: "PRODUCTS row 1. The app's ONLY reach for custom.form_public and custom.form_submit, both server-lane doors granted to service_role alone. server-only, cached per request. Schema custom stays revoked from anon; nothing here widens that.",
    },
    {
        id: "public-sign-page",
        file: "app/(link)/sign/[token]/page.tsx",
        kind: "door_gated",
        why: "PRODUCTS row 16. The public signing page at its unguessable link, server-rendered for somebody with NO ACCOUNT. There is no person to read the campaign switch for and no organization the caller may name: the switch is asked INSIDE custom.sign_request_public, for the organization the request itself belongs to, and a request whose store is off answers exactly as a wrong link does. The browser never holds a store client - the frozen document text comes from the server and the signature goes to the route handler below.",
    },
    {
        id: "public-sign-runner",
        file: "app/(link)/sign/[token]/SignRunner.tsx",
        kind: "door_gated",
        why: "PRODUCTS row 16. The one client island on the signing page: the type-or-draw control and the decline path. It is handed the frozen document by the server, builds no record-store client, holds no key and can reach no door on its own; everything it sends goes to /api/sign/<token>, whose two doors read custom/system_enabled themselves through custom.assert_store_door.",
    },
    {
        id: "public-sign-write",
        file: "app/api/sign/[token]/route.ts",
        kind: "door_gated",
        why: "PRODUCTS row 16 / VAL-10. Where a signature arrives. It adds the three things a browser cannot be trusted for on a certificate - the address it came from, the browser it came from and the real Origin header - and hands everything else to custom.sign_request_sign or custom.sign_request_decline, which decide expiry, withdrawal, whether the document moved since the ask, what counts as a drawing and whether a name is blank. The switch is those doors' own assert_store_door.",
    },
    {
        id: "public-sign-service",
        file: "features/esign/service.ts",
        kind: "door_gated",
        why: "PRODUCTS row 16. The app's ONLY reach for custom.sign_request_public, custom.sign_request_sign and custom.sign_request_decline, all three server-lane doors granted to service_role alone. server-only, cached per request. Schema custom stays revoked from anon; nothing here widens that.",
    },
    {
        id: "data-v2-tables",
        file: "app/(core)/data-v2/page.tsx",
        kind: "runtime",
        why: "THE unified data page: a person's tables from the new record store, in four lanes, with create and import. Served to users, so it reads the switch and shows the off sentence when it is off.",
    },
    {
        id: "data-v2-try-everything",
        file: "features/unified-data/test-bench/TryEverythingScreen.tsx",
        kind: "runtime",
        why: "THE TEST BENCH at /data-v2/try-everything: one page that mounts the real screens of every part of the store — tables and grid, sharing and the Access tab, relations and rollups, custom fields on a CRM contact, forms, the approval inbox, the agent's door, history, dashboards, documents and notify rules — against this organization's live data, with an honest note on each unfinished part. It is served to users and it reads the switch itself; its frames and labels live in TestBenchChrome.tsx, which reaches nothing and is deliberately not registered.",
    },
    {
        id: "rendered-document-page",
        file: "app/(core)/d/[renderId]/page.tsx",
        kind: "runtime",
        why: "PRODUCTS row 5. ONE rendered document at its own address — where the link document_propose hands a person actually lands. It reads custom.doc_render_read, which decides whether this person may see the record the document is about, and shows that door's own refusal sentence verbatim; the bytes are the frozen ones a signature seals, so there is no refresh-from-the-record control and must never be one. It opens in RichDocument, the platform's one rich document, so print and save-as-PDF come with it. Served to users, so it reads the switch and shows the off sentence when it is off.",
    },
    {
        id: "data-v2-table",
        file: "app/(core)/data-v2/[tableId]/page.tsx",
        kind: "runtime",
        why: "THE unified table page: views, the four layouts, peek with history and comments, settings, the action inbox, import and export. Served to users, so it reads the switch.",
    },
    {
        id: "shell-nav-gates",
        file: "features/shell/navigation/useShellNavGates.ts",
        kind: "runtime",
        why: "The sidebar's Data group carries a `Records` child pointing at /data-v2, and it appears only where this campaign's switch is on. This hook is the one place the sidebar resolves that switch, for this person in this organization, so a gated destination is dropped everywhere the nav is drawn. Served to every signed-in user on every page, so an unanswered switch counts as OFF and the child simply is not there.",
    },
    {
        id: "shell-nav-gates-red-twin",
        file: "features/shell/navigation/useShellNavGates.red.test.tsx",
        kind: "red_twin",
        why: "Lane NAV-FIX's RED TWIN for the sidebar gate: it wires the gate the OLD way (a synchronous Redux read inside useEffect(…, [])) and FAILS, which is what proves the real hook's four green clauses are load-bearing. It is excluded from `pnpm test` by jest.config.ts and serves no request, so it is tooling and must not be gated — a red twin held behind the campaign switch would go quiet exactly when the campaign is off, which is when a regression would land unseen. Registered by lane APPROVAL-KNOB, which found `check:campaign-entry-points` exiting 1 on origin/main for this one unregistered file.",
    },
    {
        id: "entity-custom-fields",
        file: "features/unified-data/components/EntityCustomFields.tsx",
        kind: "runtime",
        why: "THE ONE LINE a standard entity page adds (SCR-12 / REC-40), and now the ONLY place that reads the switch for it. It was `PartyRecordPage`'s own twenty-line private wrapper; lane ENTITY-FIELDS extracted it the moment a second page (the deal page) wanted the same thing, because the third would have copied it differently. The switch is read HERE, once, so a page that adds the line cannot forget it and `check:campaign-entry-points` has one row instead of one per page. Renders nothing at all when the switch is off.",
    },
    {
        id: "crm-party-custom-fields",
        file: "features/crm/components/record/PartyRecordPage.tsx",
        kind: "one_line",
        why: "The live CRM contact page carries the one line `<EntityCustomFields entityToken=\"party\" …/>`. The switch is read inside that component (entity-custom-fields), so this file holds no campaign logic of its own - it names a token.",
    },
    {
        id: "crm-deal-custom-fields",
        file: "features/crm/components/deals/DealRecordPage.tsx",
        kind: "one_line",
        why: "The live deal page carries the SAME one line with the token `crm_deal`. No per-entity code: the whole difference between the two pages is the word.",
    },
    {
        id: "web-page-custom-fields",
        file: "app/(core)/marketing/pages/[pageId]/page.tsx",
        kind: "one_line",
        why: "A standard DETAIL table (`web_page`) carrying the same one line, which is how REC-34's two types are shown to be one mechanism rather than two.",
    },
    {
        id: "web-property-custom-fields",
        file: "app/(core)/marketing/properties/[propertyId]/page.tsx",
        kind: "one_line",
        why: "Lane ENTITY-TAIL. The standard DETAIL table `web_property` on its own detail page, carrying the same one line with a different word. A server component mounting the client wrapper - which is the proof that the line costs a page nothing but the token.",
    },
    {
        id: "web-screenshot-custom-fields",
        file: "app/(core)/marketing/screenshots/[screenshotId]/page.tsx",
        kind: "one_line",
        why: "Lane ENTITY-TAIL. `web_screenshot`, a standard DETAIL, same one line. Its sibling `/marketing/snapshots/[snapshotId]` deliberately does NOT carry it: `web_snapshot` is typed Ledger in the registry with custom_fields_enabled false, so the registry already refuses it and the page must not ask.",
    },
    {
        id: "seo-collection-run-custom-fields",
        file: "features/marketing/seo/ai-visibility/CollectionRunView.tsx",
        kind: "one_line",
        why: "Lane ENTITY-TAIL. `seo_collection_run` (Entity) on the standalone AI-visibility run page. The line sits in the client half because that is where the run's card stack is; the server page owns only the RLS read and the AccessGate.",
    },
    {
        id: "message-template-custom-fields",
        file: "features/message-templates/components/TemplateViewPage.tsx",
        kind: "one_line",
        why: "Lane ENTITY-TAIL. `message_template` (Entity) in the VIEW lane of the template page. It is not in the edit lane on purpose: the custom fields are the store's own editor and the store decides who may fill them in, so putting them beside a form with its own dirty/save state would give one screen two owners.",
    },
    {
        id: "list-change-proposal-record-table",
        file: "features/list-change-proposals/applyListChange.ts",
        kind: "runtime",
        why: "The `kind:\"table\"` target of the list-change-proposal primitive reads and writes a Table homed in a Record through `@ai-matrx/records/core`'s `record_write`/`record_update`/`record_delete`/`read_records` doors. Served to users from live chat messages, so it reads the switch first and refuses with the off sentence when it is off.",
    },
    {
        id: "list-change-proposal-record-table-live-test",
        file: "features/list-change-proposals/__tests__/applyListChange.table.live.test.ts",
        kind: "tooling",
        why: "Exercises the `kind:\"table\"` branch above against the live main database as admin@admin.com, whose personal organization carries a standing per-user switch override. A test run by a developer/CI, never served to a user, so it must not call the gate itself.",
    },
    {
        id: "record-change-approval-apply",
        file: "features/record-change-approvals/applyRecordChange.ts",
        kind: "runtime",
        why: "The RESUME of a server-side record change a person approved in chat: it writes the agent's exact declaration through `@ai-matrx/records/core`'s `table_declare` / `record_update` / `record_write` doors under the person's own authority. Served to users from live conversations, so it reads the one switch first and refuses with the off sentence when it is off.",
    },
    {
        id: "organization-store-contents",
        file: "features/organizations/service/organizationStoreContents.ts",
        kind: "runtime",
        why: "The Danger Zone's one reach into the record store (bug 8500bd65): it reads `custom.organization_contents` to say in plain words what an organization holds before anybody confirms a delete, and calls `custom.organization_clear` — owner-only, name typed back, retires through the store's own doors and destroys only what the retention rule no longer protects — as the supported way to empty it. Served to every organization owner from the organization settings screen, so it reads the one switch before either door and, when the switch is off, says the organization holds nothing of this kind and lets the delete proceed exactly as it did before this file existed.",
    },
    {
        id: "record-change-approval-card",
        file: "features/record-change-approvals/RecordChangeApprovalCard.tsx",
        kind: "runtime",
        why: "The card that puts the wait on screen — the platform's own <ApprovalCard>, driven by the records tool result. It reaches the store only through the apply port above, and that port is where the switch is read; this file imports the port and never a door, so the gate it inherits is the one gate.",
    },
    {
        id: "record-change-approval-test-harness",
        file: "features/record-change-approvals/__tests__/harness.ts",
        kind: "tooling",
        why: "The shared harness for the two suites below: it signs in as admin@admin.com, builds a records client against the live store and carries the waits the server half actually produced. A test harness serves no request, so it must not be gated — gating it would make the suite go quiet exactly when the campaign is off, which is when a regression would land unseen.",
    },
    {
        id: "record-change-approval-live-test",
        file: "features/record-change-approvals/__tests__/recordChangeApproval.live.test.tsx",
        kind: "tooling",
        why: "Renders the approval card against the LIVE record store as admin@admin.com: approve lands the column and the store is read back to prove it; decline leaves it absent. Run by a developer, never served, so it does not call the gate itself.",
    },
    {
        id: "record-change-approval-red-twin",
        file: "features/record-change-approvals/__tests__/recordChangeApproval.red.test.tsx",
        kind: "red_twin",
        why: "The RED TWIN of the suite above: it asserts the world before this lane — a wait nobody could act on, an approval that could not land, a decline that named no setting — and FAILS all three, which is what makes the green twin mean something.",
    },
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
        id: "db-based-on",
        file: "scripts/db-based-on.ts",
        kind: "tooling",
        why: "`pnpm db:based-on` — prints the `-- based-on:` line for a function from the LIVE catalogue. It imports migration-target only to resolve `--based-on-target branch`, which picks WHICH database it measures; a hash taken from one database and checked against the other refuses when the bodies differ. Read-only, run by hand, never part of a served request.",
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
        id: "check-branch-schema-drift",
        file: "scripts/check-branch-schema-drift.ts",
        kind: "tooling",
        why: "pnpm check:branch-schema-drift — W0-SYNC's gate that production holds no event trigger, function, trigger, policy or table the rehearsal branch lacks. Both connections run inside a read-only transaction and it has no write path; a human or the chair's pre-dispatch gate runs it, and it serves nothing.",
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
        id: "gate-corpus-merge-plan",
        file: "scripts/gate-corpus/merge-plan.ts",
        kind: "tooling",
        why: "BUILD-BOOK §13's row disposition for THE REFRESH — the marker, the guarded upsert, the guarded delete and the replace path they are contrasted with. Pure SQL construction plus catalogue reads; both restore-graph.ts --merge and refresh-merge-proof.ts call it, so the proof exercises the shipped statements. No credential, never part of a served request.",
    },
    {
        id: "gate-corpus-door-surface",
        file: "scripts/gate-corpus/door-surface.ts",
        kind: "tooling",
        why: "restore-graph --verify's DOOR-SURFACE verdict, extracted so it can be tested without either database. A door production holds and the branch lacks is a SECURITY DEFINER function whose client EXECUTE grant silently does not stick on the branch. Pure comparison, no database, no credential.",
    },
    {
        id: "restore-graph-door-surface-test",
        file: "scripts/__tests__/restore-graph-door-surface.test.ts",
        kind: "tooling",
        why: "Jest proof of that verdict: five missing doors pass, six fail by name, one definition mismatch fails with no tolerance, and a branch-only door is reported without failing. No database, no credential.",
    },
    {
        id: "gate-corpus-refresh-merge-proof",
        file: "scripts/gate-corpus/refresh-merge-proof.ts",
        kind: "tooling",
        why: "RED-then-GREEN for §13's merge: the replace path takes the campaign-owned count to zero in a disposable zz_w0_* schema, the merge path leaves it equal and non-zero, and a planted row on the live branch survives a real --merge with the receipt counting it. Branch-only — it opens no production connection at all — and serves nothing to a user.",
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
    {
        id: "client-portal-service",
        file: "features/portals/service.ts",
        kind: "door_gated",
        why: "THE CLIENT PORTAL's only data access. The sign-in lane (custom.portal_public / portal_invitation / portal_principal_bind) is service_role and server-only, exactly like the public form's; the SIGNED-IN lane (custom.portal_me, read_records, read_record, record_update, applicable_fields, io_comments, io_comment_write) goes through the outsider's OWN server client, never the admin client, because those doors are what decide what she sees. The switch is read one layer down, inside each door's custom.assert_store_door / store_is_open, for the organization the PORTAL belongs to — the only correct one, since the person here has no organization grant to read a knob against. This module holds the one createAdminClient().schema('custom') cast for the sign-in lane and nothing widens it.",
    },
    {
        id: "client-portal-shown",
        file: "features/portals/shown.ts",
        kind: "door_gated",
        why: "What a client portal screen is ALLOWED to render: the intersection of custom.portal_me()'s visible_fields (the access decision) with custom.applicable_fields' labels and order (the vocabulary). It is registered because a masked field is NOT absent from a read_records document — it comes back as a NULL key beside a _hidden block — so this is the file that stops a page printing the NAME of a field the portal never opened. It reaches the store only through features/portals/service.ts, whose doors read the switch themselves.",
    },
    {
        id: "client-portal-page",
        file: "app/(portal)/portal/c/[slug]/page.tsx",
        kind: "door_gated",
        why: "The client portal at its own link, server-rendered for an outsider with no organization grant. It reads no campaign switch the way a signed-in member's page does — there is no organization she may name and asking the switch for her would answer the platform default for every organization on earth. custom.portal_public answers null for missing, closed and store-switched-off alike (that is the 404), and every signed-in read goes through her own doors. The browser never holds a store client.",
    },
    {
        id: "client-portal-record-page",
        file: "app/(portal)/portal/c/[slug]/r/[recordId]/page.tsx",
        kind: "door_gated",
        why: "One record on the client portal, same lane and same reasoning as the portal page. Which fields appear is custom.portal_me()'s visible_fields; which Table the record is in is answered by custom.read_records rather than inferred; the comment thread exists only where the door says comments are on. Every door reads the switch itself via custom.assert_store_door.",
    },
    {
        id: "client-portal-record-actions",
        file: "app/(portal)/portal/c/[slug]/r/[recordId]/actions.ts",
        kind: "door_gated",
        why: "Where a client's edit and her comment arrive. The organization id is resolved from custom.portal_me() and never taken from the browser, and custom.record_update / custom.io_comment_write decide everything else — a field the portal did not open is refused BY THE DOOR, whose sentence and hint are returned verbatim. The switch is those doors' own assert_store_door.",
    },
    {
        id: "client-portal-sign-in-route",
        file: "app/api/portal/[slug]/sign-in/route.ts",
        kind: "door_gated",
        why: "Where a client asks for her sign-in link, served to somebody with no account. It reaches custom.portal_public and custom.portal_invitation (both service_role, both reading the switch themselves for the portal's own organization) and writes the grant through custom.portal_principal_bind. It answers the same sentence whether or not the address was invited, and never logs, returns or stores the link or the token.",
    },
    {
        id: "unified-data-campaign-ramp",
        file: "lib/knobs/unifiedDataCampaignRamp.ts",
        kind: "runtime",
        why: "THE RAMP — CUT-3's per-consumer, per-organization half of the switch. It is served code and it reads the kill switch itself (`UNIFIED_DATA_CAMPAIGN.enabled()`) before it looks at any consumer knob, so a consumer switched on for an organization still reads the old table while the campaign is off.",
    },
    {
        id: "unified-data-campaign-ramp-register",
        file: "lib/knobs/unifiedDataCampaignRamp.register.ts",
        kind: "tooling",
        why: "The eight consumer ids and the id-to-knob-key rule, split out for the same reason as this file: pure, import-free, readable by a guard in a bare checkout. It reads no knob and must not be gated.",
    },
];

/**
 * The entries the switch is actually responsible for. EMPTY TODAY, on purpose:
 * see the register above. `check:campaign-entry-points` demands that each of
 * these imports this module and calls `enabled()`.
 */
export const RUNTIME_ENTRY_POINTS: readonly CampaignEntryPoint[] =
    ENTRY_POINTS.filter((entry) => entry.kind === "runtime");

