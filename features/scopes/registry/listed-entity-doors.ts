import type { EntityTypeToken } from "@ai-matrx/associations";

/**
 * THE CENSUS BEHIND THE DOOR LAW, FOR EVERY LISTED ENTITY — the register that
 * makes a doorless entity IMPOSSIBLE TO ADD QUIETLY.
 *
 * 🚨 WHY THIS FILE EXISTS (lane F-93, hostile verifier V-22, finding NEW-6).
 * F-82 gave `calendar_event` and `google_document` their first door because a
 * verifier named those two tokens, and stopped there. Nothing had ever asked
 * the general question, so nobody knew the answer: of the 99 tokens live
 * `platform.entity_types` marks `is_active` AND `is_listed` (read 2026-09-18),
 * EIGHTY-TWO had no door of any kind — no `hrefFor` in the entity overlay, no
 * registered peek, and no in-place opener in the item-presentation registry.
 * Two of them were live SYNCED entities (`media_source_library`,
 * `web_youtube_video`), which is how V-22 found the class at all. The two are
 * fixed; the remaining eighty are written down here, once, so the next listed
 * entity cannot join them without a person deciding to.
 *
 * WHAT A "DOOR" IS, MECHANICALLY (the three the platform already ships):
 *   1. `hrefFor` on the token in `entityRegistry.ts` — the durable ADDRESS
 *      (R35): a deep link, an Open-in-new-tab, `pnpm check:dead-ends`.
 *   2. A registered peek — `PEEK_KINDS` in
 *      `features/organizations/peek/kinds-list.ts`.
 *   3. An in-place opener — an `open` discriminant (and/or a `detailSource`) in
 *      `features/item-presentation/registry.tsx`, reached through
 *      `useOpenItemPresentation`.
 * A token with none of the three is named by a list UI and cannot be opened
 * from anywhere. That is THE DOOR LAW broken, every time, by construction.
 *
 * 🚨 THIS IS A CENSUS, NOT AN EXONERATION, AND IT MAY ONLY SHRINK.
 * An entry here does NOT say "this entity is fine without a door". It says the
 * gap is KNOWN and COUNTED. `DOORLESS_BASELINE` is the number the census found;
 * the guard fails if the map ever grows past it, if an entry's token is no
 * longer a listed entity, or if an entry's token has GAINED a door (a stale
 * entry hides the very door it claims is missing). Per
 * `common-docs/policies/unfinished-work-alarm.md`, an unmeasured entry means a
 * door is presumed OWED — never that the entity is dead or deliberately closed.
 *
 * Guard: `features/scopes/registry/every-listed-entity-has-a-door.test.ts`.
 */

/**
 * The reasons an entry may carry. A new reason is a deliberate ruling and gets
 * its own key with its own sentence — never a second token squeezed under a
 * sentence that is not true of it.
 */
export const DOORLESS_REASONS = {
  /**
   * No door of any kind, and THIS LANE DID NOT MEASURE whether one is owed,
   * impossible, or already half-built behind a list surface. It is counted so
   * the number can only fall, and so the next agent working the feature that
   * owns the token meets the gap instead of discovering it from a screen. A
   * door is presumed owed.
   */
  UNMEASURED:
    "Listed by a live list surface with no address, no peek and no in-place " +
    "opener. Counted by the F-93 census; whether the door is owed or genuinely " +
    "impossible has not been measured, so it is presumed OWED.",
  /**
   * The record HAS a working route and the route is not keyed on the row id, so
   * no synchronous `hrefFor(id)` can be right. The honest door is a resolver
   * route (id → the keyed address, the way `/marketing/sites/<id>` redirects) or
   * a peek — never an `hrefFor` that guesses.
   */
  KEYED_ON_A_KEY_NOT_AN_ID:
    "A working route exists but addresses the record by its KEY, not by its id " +
    "(`/mandates/[mandateKey]`), so an id-only `hrefFor` would 404. The door is " +
    "a resolver route or a peek, and neither is built yet.",
} as const;

export type DoorlessReason = keyof typeof DOORLESS_REASONS;

/**
 * 🚨 Keyed by `EntityTypeToken`, the union GENERATED from
 * `platform.entity_types` — so a misspelled or retired token in the census below
 * is a compile error naming the spelling, never a line that quietly excuses
 * nothing.
 */
type DoorlessCensus = Partial<Record<EntityTypeToken, DoorlessReason>>;

/**
 * Every listed entity token with no door, and why the gap is recorded rather
 * than closed. Sorted by token; grouped by the schema the table lives in only
 * for readability.
 */
const CENSUS = {
  // agent.*
  agent_exemplar: "UNMEASURED",
  // ai.*
  ai_model: "UNMEASURED",
  ai_model_alias: "UNMEASURED",
  ai_provider: "UNMEASURED",
  ai_setting: "UNMEASURED",
  // browser.*
  browser_login_recipe: "UNMEASURED",
  browser_profile: "UNMEASURED",
  browser_site_policy: "UNMEASURED",
  // commerce.*
  commerce_certified_printer: "UNMEASURED",
  commerce_cloud_sync_connection: "UNMEASURED",
  commerce_intake_batch: "UNMEASURED",
  commerce_label_batch: "UNMEASURED",
  commerce_marketplace_account: "UNMEASURED",
  commerce_print_order: "UNMEASURED",
  commerce_product: "UNMEASURED",
  // content_ir.*
  content_ir_kind_instance: "UNMEASURED",
  // context.*
  system_context_item: "UNMEASURED",
  // crm.*
  crm_blocklist_entry: "UNMEASURED",
  crm_registry_source: "UNMEASURED",
  crm_saved_view: "UNMEASURED",
  // education.*
  learn_doc: "UNMEASURED",
  // esign.*
  esign_campaign: "UNMEASURED",
  esign_consent_disclosure: "UNMEASURED",
  esign_envelope: "UNMEASURED",
  esign_provider_binding: "UNMEASURED",
  // files.*
  files_machine_written_prefix: "UNMEASURED",
  files_sync_mapping: "UNMEASURED",
  // hindsight.*
  hindsight_regression_case: "UNMEASURED",
  hindsight_replay_step: "UNMEASURED",
  // hr.*
  hr_asset: "UNMEASURED",
  hr_candidate: "UNMEASURED",
  hr_careers_portal: "UNMEASURED",
  hr_checklist_template: "UNMEASURED",
  hr_course: "UNMEASURED",
  hr_crew: "UNMEASURED",
  hr_deduction_code: "UNMEASURED",
  hr_department: "UNMEASURED",
  hr_earning_code: "UNMEASURED",
  hr_holiday_calendar: "UNMEASURED",
  hr_interview_kit: "UNMEASURED",
  hr_job_title: "UNMEASURED",
  hr_leave_policy: "UNMEASURED",
  hr_location: "UNMEASURED",
  hr_pay_group: "UNMEASURED",
  hr_posting: "UNMEASURED",
  hr_provider_binding: "UNMEASURED",
  hr_requisition: "UNMEASURED",
  hr_schedule: "UNMEASURED",
  hr_schedule_guidance: "UNMEASURED",
  hr_schedule_template: "UNMEASURED",
  hr_survey: "UNMEASURED",
  hr_workflow_definition: "UNMEASURED",
  hr_workflow_flow_type: "UNMEASURED",
  hr_workflow_instance: "UNMEASURED",
  // iam.*
  iam_api_key: "UNMEASURED",
  // interview.*
  interview_decision_interview: "UNMEASURED",
  interview_session: "UNMEASURED",
  // mandate.*
  mandate: "KEYED_ON_A_KEY_NOT_AN_ID",
  mandate_binding: "UNMEASURED",
  // ops.*
  ops_proof_check: "UNMEASURED",
  ops_proof_scenario: "UNMEASURED",
  // plan.*
  plan_entity: "UNMEASURED",
  // platform.*
  assist: "UNMEASURED",
  custom_entity_definition: "UNMEASURED",
  custom_field_definition: "UNMEASURED",
  custom_field_target: "UNMEASURED",
  platform_outcome_event: "UNMEASURED",
  platform_saved_view: "UNMEASURED",
  purpose: "UNMEASURED",
  // research.*
  research_context_bundle: "UNMEASURED",
  // seo.*
  seo_dimension_value_matcher: "UNMEASURED",
  seo_geo_place: "UNMEASURED",
  seo_keyword_saved_view: "UNMEASURED",
  seo_map_facet: "UNMEASURED",
  seo_map_facet_value: "UNMEASURED",
  seo_site_value_combo: "UNMEASURED",
  seo_site_value_worth: "UNMEASURED",
  seo_starter_pack: "UNMEASURED",
  // ui.*
  surface: "UNMEASURED",
  // workflow.*
  workflow_runtime_surface: "UNMEASURED",
  // 🚨 `satisfies` ON THE FRESH LITERAL, not on the exported const: that is what
  // makes an unregistered token an excess-property ERROR here. Annotating the
  // export instead (`Object.freeze({…}) as Readonly<DoorlessCensus>`) type-checks
  // a misspelled token happily, because the literal is no longer fresh by then —
  // proven by planting `not_a_real_token` both ways.
} satisfies DoorlessCensus;

export const DOORLESS_LISTED_ENTITIES: Readonly<DoorlessCensus> = Object.freeze(CENSUS);

/**
 * The size of the census when it was taken (F-93, 2026-09-18). A RATCHET: the
 * guard fails when the map grows, so a new listed entity must arrive WITH a
 * door — or someone must lower this number by giving an old one its door in the
 * same change.
 */
export const DOORLESS_BASELINE = 80;
