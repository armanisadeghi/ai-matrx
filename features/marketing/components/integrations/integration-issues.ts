/**
 * THE CONFIGURATION-ISSUE RULES for the site Integrations editor, as pure
 * functions so they can be proven with a fixture instead of asserted in prose.
 *
 * Both rules here exist because of the zero-authorship verification of
 * 2026-09-17 (google-native `VERIFY-U-P4-U-M1.md`):
 *
 * B-1 — every Search Console property guard was gated on the binding already
 * being `enabled`, so nothing judged the FIRST Enable, which is the one moment
 * PLAN §4.8 was written for: the editor saved the mismatch and fired a
 * ~16-month backfill against the wrong property. `gscConfigurationIssues`
 * judges the DRAFT — a picked property is judged whether or not the switch is
 * on.
 *
 * B-3 — the per-provider button stayed enabled while an issue stood and its
 * handler returned early on that same issue list, so the click did nothing and
 * said nothing. `providerIssueMessages` + `providerActionDisabled` give that
 * button the page-level Save button's rule, and the messages print beside it.
 */

import { judgeGscBindingWrite } from "@/features/marketing/google/gsc-property";
import { validateSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import type {
  BuiltInProviderKey,
  SiteIntegrationsDraft,
} from "@/features/marketing/data/integrations-schema";

export interface IntegrationIssue {
  /** `<providerKey>.<field>` — the prefix is how a card finds its own issues. */
  field: string;
  message: string;
}

/** The site facts a property is judged against. */
export interface IntegrationSiteFacts {
  root_url?: string | null;
  domain: string;
}

/**
 * The Search Console issues for a draft. Never reads `enabled`: a property
 * that is picked is judged, because the next click is the one that binds it.
 */
export function gscConfigurationIssues(
  draft: Pick<SiteIntegrationsDraft, "googleSearchConsole">,
  site: IntegrationSiteFacts,
): IntegrationIssue[] {
  const judgement = judgeGscBindingWrite(draft.googleSearchConsole, site);
  if (judgement.allowed || !judgement.sentence) return [];
  return [
    {
      field: "googleSearchConsole.resourceRef",
      message: judgement.sentence,
    },
  ];
}

/** One provider card's own issues, in the words the page-level list uses. */
export function providerIssueMessages(
  issues: readonly IntegrationIssue[],
  providerKey: BuiltInProviderKey,
): string[] {
  return issues
    .filter((issue) => issue.field.startsWith(providerKey))
    .map((issue) => issue.message);
}

/**
 * Whether a provider card's own action button is disabled. An unresolved issue
 * disables it — the alternative is the lying button this replaced.
 */
export function providerActionDisabled(input: {
  enabled: boolean;
  dirty: boolean;
  saving: boolean;
  issueCount: number;
}): boolean {
  if (input.saving) return true;
  if (input.issueCount > 0) return true;
  return input.enabled && !input.dirty;
}

/**
 * THE WHOLE-DRAFT WRITE ASKS THE SAME JUDGE (round-2 verdict NEW-B6).
 *
 * `persistBuiltInProvider` — the single-provider path — called
 * `judgeGscBindingWrite` before writing. The PAGE-LEVEL Save did not: it wrote
 * the entire integrations blob through `updateSiteIntegrations` and gated only
 * on the issue list the screen happened to be SHOWING. On the OAuth-review
 * surface that list was filtered to Google Analytics, so a pre-existing Search
 * Console mismatch was re-saved, unjudged, with the Save button enabled and the
 * refusal hidden. Five write paths, one judge — this is the fifth.
 *
 * It is also the list a screen must SHOW: an issue that blocks the Save and is
 * not on screen is the lying button B-3 removed, wearing a different hat. Every
 * surface prints what this returns; none of them filters it.
 */
export function integrationsWriteIssues(
  draft: SiteIntegrationsDraft,
  site: IntegrationSiteFacts,
): IntegrationIssue[] {
  return [...validateSiteIntegrations(draft), ...gscConfigurationIssues(draft, site)];
}

/** The refusal sentence for a whole-draft write, or null when it may proceed. */
export function integrationsWriteRefusal(
  draft: SiteIntegrationsDraft,
  site: IntegrationSiteFacts,
): string | null {
  const issues = integrationsWriteIssues(draft, site);
  if (!issues.length) return null;
  return issues.map((issue) => issue.message).join(" ");
}
