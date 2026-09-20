/**
 * applyRecordChange — THE RESUME, and it is now the SAME OPERATION that waited.
 *
 * WHAT WAS WRONG WITH THE FIRST VERSION (seventh verification pass, 2026-09-19).
 * It worked, and it wrote the wrong thing: approving a column patched the
 * table's `fields` list and then wrote the Field through
 * `custom.record_write`, which stamps `data_class = 'record'`. A field stored
 * as a plain record is second-class — invisible to the delete rules and to the
 * formula-dependency check. So "approve" produced a column the store could not
 * fully see, while the unattended path produced a real one. An approval that
 * lands something different from what it approved is the defect, however
 * cheerful the sentence afterwards.
 *
 * THE FIX IS TO STOP RE-IMPLEMENTING THE WRITE. A wait is a row in the one
 * approval queue now (`custom.record`, `data_class = 'work_approval'`, filed by
 * the store's own `field_propose` / `record_propose`), and
 * `custom.work_approval_decide` is the door that decides it: on yes it APPLIES
 * the change in the decision's own transaction, through `custom.field_declare`
 * for a column and `custom.record_write` for rows, as the person deciding, with
 * every guard and validator and their name on the history row. That is the same
 * door the unattended path runs — so the resumed write and a direct write are
 * the same bytes, which is the only way this card can honestly claim to apply
 * "what you were shown".
 *
 * THE DECLINE IS A DECISION, NOT A DISMISSAL. It goes through the same door, so
 * the queue row reads `declined` with who decided and when, and the wait stops
 * being pending for everyone — not just for whoever had this conversation open.
 *
 * WHY THE BROWSER AND NOT THE SERVER. The `records` tool has already answered by
 * the time anybody sees a card: the agent's call is over and there is no
 * suspended call to unblock. The decision is therefore taken here, as the
 * signed-in person, which is also the honest reading of the policy — the
 * organization asks A PERSON before an agent changes a table that already
 * existed, and the person is the one deciding.
 *
 * NOTHING FAILS SILENTLY. Every refusal comes back in the store's own words.
 */

import { recordsDataSource } from "@ai-matrx/records-ui";

import { createClient } from "@/utils/supabase/client";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import {
  UNIFIED_DATA_CAMPAIGN,
  UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE,
} from "@/lib/knobs/unifiedDataCampaign";

import type { RecordChangeWait } from "./recordChangeApproval";

export type ApplyApprovedOutcome =
  /** The store changed. `detail` names what a person will now see. */
  | { status: "applied"; detail: string; recordId: string | null }
  /** It was already there. A no-op, said out loud rather than dressed as a win. */
  | { status: "already"; detail: string }
  /** The store said no. `detail` is the store's own sentence, never a paraphrase. */
  | { status: "refused"; detail: string };

/**
 * `custom.work_approval_decide`'s answer, as the door builds it.
 *
 * `message` is the store's own outcome sentence — "Rate card is now a column on
 * Crews", "Applied. 20 records are now in Crews" — so the card never composes a
 * second description of what just happened.
 */
interface DecisionAnswer {
  approval_id?: string | null;
  state?: string | null;
  applied?: boolean | null;
  field_id?: string | null;
  record_ids?: string[] | null;
  message?: string | null;
}

/**
 * THE switch, and there is only one: does this ORGANIZATION keep its data in
 * the unified record store? Asked before any door, exactly as every other
 * served reach into the store asks it.
 */
async function reachOrRefusal(): Promise<
  | { organizationId: string; rpc: ReturnType<typeof recordsDataSource>["rpc"] }
  | { refused: string }
> {
  const state = getStoreSingleton()?.getState();
  const organizationId = state ? selectActiveOrganizationId(state) : null;
  if (!(await UNIFIED_DATA_CAMPAIGN.enabled(organizationId))) {
    return { refused: UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE };
  }
  if (!organizationId) {
    return {
      refused: "No organization is active, so the record store cannot be reached.",
    };
  }
  // THE DOOR IS CALLED DIRECTLY RATHER THAN THROUGH `createRecordsClient`, and
  // that is deliberate rather than a shortcut: the package checks every call
  // against the door list GENERATED at its last publish, and `work_approval_*`
  // landed after it. A published package is the right home for this once it
  // ships; until then, going through the same data source with the same schema
  // is the honest option — the alternative is a card that refuses a live door
  // because a build artefact has not caught up.
  return { organizationId, rpc: recordsDataSource(createClient()).rpc };
}

/** What a door refusal reads like when the person, not a log, is the audience. */
function sentenceFor(error: unknown): string {
  const named = error as { message?: string; hint?: string } | null;
  const message = named?.message?.trim();
  const hint = named?.hint?.trim();
  if (message && hint) return `${message} ${hint}`;
  return message || "The store refused the change and gave no reason.";
}

/** Approve or decline exactly the change a person was shown. */
async function decide(
  wait: RecordChangeWait,
  approve: boolean,
): Promise<ApplyApprovedOutcome> {
  if (!wait.approvalId) {
    // A WAIT WITH NO QUEUE ROW IS NOT DECIDABLE, and saying so is the whole
    // point of this branch. A table an organization on `always_ask` refused
    // has no subject to have been filed against, so there is nothing to
    // approve — the person creates it themselves, and the card says that
    // rather than offering a button that would write something nobody filed.
    return {
      status: "refused",
      detail:
        "There is nothing queued to approve for this change, so it cannot be " +
        "applied from here — the answer in the conversation says what was asked " +
        "for and what to do.",
    };
  }
  const reached = await reachOrRefusal();
  if ("refused" in reached) return { status: "refused", detail: reached.refused };

  const response = (await reached.rpc(
    "work_approval_decide",
    {
      p_organization_id: reached.organizationId,
      p_approval_id: wait.approvalId,
      p_approve: approve,
      p_note: null,
    },
    { schema: "custom" },
  )) as { data?: DecisionAnswer | null; error?: unknown };

  if (response.error) {
    return { status: "refused", detail: sentenceFor(response.error) };
  }
  const answer = (response.data ?? {}) as DecisionAnswer;
  const outcome = answer.message?.trim();
  if (!approve) {
    return {
      status: "applied",
      recordId: null,
      detail: `${outcome || "The change was not made."} ${wait.policy.howToChange}`,
    };
  }
  return {
    status: "applied",
    recordId: answer.field_id ?? answer.record_ids?.[0] ?? null,
    detail: outcome || "The change was applied.",
  };
}

/** Apply exactly the change a person approved. */
export async function applyApprovedRecordChange(
  wait: RecordChangeWait,
): Promise<ApplyApprovedOutcome> {
  return decide(wait, true);
}

/** Record the decision when the person keeps things as they are. */
export async function declineRecordChange(
  wait: RecordChangeWait,
): Promise<ApplyApprovedOutcome> {
  return decide(wait, false);
}

/**
 * What the table a pending change belongs to is CALLED.
 *
 * A card that says "a column on table 8f3c…" names a record a person cannot
 * recognise, which is the same dead end in a smaller font. The store's own read
 * door answers, under the person's own rights; when it cannot, the caller says
 * nothing about the table rather than showing an id.
 */
export async function tableNameFor(tableId: string): Promise<string | null> {
  const reached = await reachOrRefusal();
  if ("refused" in reached) return null;
  const response = (await reached.rpc(
    "read_record",
    { p_organization_id: reached.organizationId, p_record_id: tableId },
    { schema: "custom" },
  )) as { data?: Record<string, unknown> | null; error?: unknown };
  if (response.error) return null;
  const document = response.data ?? null;
  const name = document?.["name"] ?? document?.["label_singular"];
  return typeof name === "string" && name.trim() ? name : null;
}
