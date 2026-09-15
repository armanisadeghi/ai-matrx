// features/masterwork/drip/service.ts
//
// Reading and writing THE DAILY DRIP on `platform.rulebook.metadata`.
//
// 🚨 METADATA ONLY, AND `version` IS NEVER BUMPED. `version` is the RULES
// version a built Masterwork drifts against; answering this morning's question
// is not a change to the rules, and bumping it here would make a freshly built
// Masterwork read "needs rebuild" every single day. The column is still the
// compare-and-swap token: we guard ON it without moving it. Same discipline,
// same reason, as `prediction/service.ts`.
//
// Direct supabase-js, per platform doctrine — there is no Python hop for a pure
// UI↔DB write. Two things go to the server, and only two, because only they
// cannot happen in a browser: sending today's question (it is a notification on
// somebody's chosen channel) and distilling the answers.

import { supabase } from "@/utils/supabase/client";
import { guardedUpdate } from "@ai-matrx/data/db";
import { operationFailed } from "@/utils/errors";
import { callApi } from "@/lib/api/call-api";
import type { AppStore } from "@/lib/redux/store";
import type { paths } from "@/types/python-generated/api-types";
import { setNotificationPreference } from "@/features/settings/notification-preferences";
import { parseRulebook, type Rulebook, type RulebookRow } from "../types";
import {
  DAILY_DRIP_SCHEMA,
  localTimezone,
  readDrip,
  type DailyDrip,
  type DripChannel,
  type DripDay,
  type DripQuestionSet,
  type DripSubscription,
} from "./scoring";

const rulebookTable = () => supabase.schema("platform").from("rulebook");

/** How many times a write re-reads and re-applies before giving up. */
const MAX_ATTEMPTS = 3;

/** The registered notification event today's question rides on. */
export const DAILY_DRIP_EVENT = "masterwork.daily_drip_question";

export const DRIP_SEND_NOW_PATH = "/masterworks/drip/send-now" as keyof paths;
export const DRIP_INGEST_PATH = "/masterworks/ingest-drip" as keyof paths;

/** The Mandates behind each half — shown to the Expert by `AgentCredit`. */
export const DRIP_QUESTION_MANDATE = "masterwork.drip_question";
export const DRIP_DISTILLER_MANDATE = "masterwork.drip_distiller";

export type DripWriteResult =
  | { status: "saved"; rulebook: Rulebook; drip: DailyDrip }
  /** The row moved under us on every attempt — the caller reloads and says so. */
  | { status: "conflict" }
  | { status: "not_found" };

/** The drip as it stands on a Rulebook already in hand. No round trip. */
export function dripOf(rulebook: Pick<Rulebook, "metadata">): DailyDrip {
  return readDrip(rulebook.metadata);
}

/** Re-read the drip from the database (after a send or a server run). */
export async function fetchDrip(rulebookId: string): Promise<DailyDrip> {
  const { data, error } = await rulebookTable()
    .select("metadata")
    .eq("id", rulebookId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw operationFailed("read your daily questions", error);
  return readDrip((data as { metadata: unknown } | null)?.metadata);
}

/**
 * THE ONE WRITE. Every change to the subscription and every answer goes through
 * here: read the row, transform the block, compare-and-swap on the version we
 * read. The transform runs again on every retry against the FRESH block, so a
 * morning's answer and a settings change made in two tabs never lose one — the
 * loser of a CAS race re-applies its own change to the winner's block rather
 * than overwriting it.
 */
async function mutateDrip(
  rulebookId: string,
  transform: (drip: DailyDrip) => DailyDrip,
): Promise<DripWriteResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { data, error } = await rulebookTable()
      .select("*")
      .eq("id", rulebookId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw operationFailed("save your daily question settings", error);
    if (!data) return { status: "not_found" };

    const row = data as RulebookRow;
    const baseMeta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const next = transform(readDrip(row.metadata));
    const metadata = {
      ...baseMeta,
      daily_drip: {
        schema: DAILY_DRIP_SCHEMA,
        subscription: next.subscription,
        days: next.days,
      },
    };

    const result = await guardedUpdate<RulebookRow>({
      expectedVersion: row.version,
      // No `nextVersion` in the patch — see the header. The guard is the
      // `.eq("version", expectedVersion)` filter, which still refuses a write
      // over a row someone else moved.
      applyUpdate: ({ expectedVersion }) =>
        rulebookTable()
          .update({ metadata } as never)
          .eq("id", rulebookId)
          .eq("version", expectedVersion)
          .is("deleted_at", null)
          .select("*")
          .maybeSingle(),
      fetchCurrent: () =>
        rulebookTable()
          .select("*")
          .eq("id", rulebookId)
          .is("deleted_at", null)
          .maybeSingle(),
    });
    if (result.status === "saved") {
      return { status: "saved", rulebook: parseRulebook(result.row), drip: next };
    }
    if (result.status === "not_found") return { status: "not_found" };
    // conflict → loop, re-read, re-apply the same transform to the new block.
  }
  return { status: "conflict" };
}

export interface DripOptIn {
  channel: DripChannel;
  sendHourLocal: number;
  questionSet: DripQuestionSet;
  /** Defaults to the browser's own timezone — whose morning this is. */
  timezone?: string;
}

/**
 * Turn the drip on (or change its settings), and put the channel choice where
 * the platform actually reads it.
 *
 * 🚨 THE CHANNEL IS WRITTEN TWICE ON PURPOSE, AND THE TWO WRITES MEAN DIFFERENT
 * THINGS. `communication.notification_preference` is what DECIDES where the
 * question arrives — the one ladder every notice on this platform obeys, the
 * same rows the Notifications settings screen writes, read by the server at
 * send time. The copy on the subscription is what this screen SHOWS, so the
 * door can say "by email, at 8am" without a round trip per render. The
 * preference is written FIRST: if it fails, nothing is turned on, and the
 * Expert is told — rather than ending up subscribed to a question that goes
 * somewhere they did not pick.
 */
export async function subscribeToDrip(
  rulebookId: string,
  input: DripOptIn,
): Promise<DripWriteResult> {
  const chosen = input.channel;
  // Every channel is set explicitly — including the ones being turned OFF.
  // Leaving them to the event's defaults would mean picking "text me" and
  // still getting the email, which is the screen lying about a setting the
  // person just changed.
  for (const channel of ["in_app", "email", "sms"] as const) {
    await setNotificationPreference(DAILY_DRIP_EVENT, channel, channel === chosen);
  }

  const startedAt = new Date().toISOString();
  return mutateDrip(rulebookId, (drip) => {
    const subscription: DripSubscription = {
      active: true,
      channel: chosen,
      send_hour_local: Math.max(0, Math.min(23, Math.round(input.sendHourLocal))),
      timezone: input.timezone || localTimezone(),
      question_set: input.questionSet,
      started_at: drip.subscription?.started_at || startedAt,
      // Changing a setting is also an un-pause: somebody in here changing when
      // they are asked is somebody who wants to be asked.
      paused_at: null,
      pause_reason: "",
    };
    return { ...drip, subscription };
  });
}

/** Stop the questions, at the Expert's own request. */
export async function stopDrip(rulebookId: string): Promise<DripWriteResult> {
  return mutateDrip(rulebookId, (drip) =>
    drip.subscription
      ? {
          ...drip,
          subscription: {
            ...drip.subscription,
            active: false,
            paused_at: null,
            pause_reason: "",
          },
        }
      : drip,
  );
}

/** Start again after the drip paused itself — or after they stopped it. */
export async function resumeDrip(rulebookId: string): Promise<DripWriteResult> {
  return mutateDrip(rulebookId, (drip) =>
    drip.subscription
      ? {
          ...drip,
          subscription: {
            ...drip.subscription,
            active: true,
            paused_at: null,
            pause_reason: "",
          },
        }
      : drip,
  );
}

/**
 * Answer one day's question.
 *
 * Returns `not_found` when there is no row for that day — an answer to a
 * question nobody asked is refused rather than invented, because the question
 * IS the provenance every rule from this lane carries.
 */
export async function answerDripDay(
  rulebookId: string,
  day: string,
  answer: string,
  capturedBy: DripDay["captured_by"],
): Promise<DripWriteResult> {
  const text = answer.trim();
  if (!text) return { status: "not_found" };
  const answeredAt = new Date().toISOString();
  let hit = false;
  const result = await mutateDrip(rulebookId, (drip) => {
    const days = drip.days.map((d) => {
      if (d.day !== day) return d;
      hit = true;
      return { ...d, answer: text, answered_at: answeredAt, captured_by: capturedBy };
    });
    // Answering is also the un-pause: somebody who replies is listening.
    const subscription =
      drip.subscription && drip.subscription.paused_at
        ? { ...drip.subscription, active: true, paused_at: null, pause_reason: "" }
        : drip.subscription;
    return { ...drip, days, subscription };
  });
  return hit ? result : { status: "not_found" };
}

export interface DripSendReport {
  asked: number;
  already_asked_today: number;
  not_yet_their_hour: number;
  paused_for_silence: number;
  fell_back_to_base_question: number;
  errors: number;
}

/**
 * Ask today's question NOW.
 *
 * 🚨 Goes to the server and not around it, because the send IS a notification
 * on somebody's chosen channel plus a paid call to the question writer —
 * neither of which a browser can do. The server runs exactly the pass the
 * scheduler runs, narrowed to this Rulebook, so there is one sender and the
 * once-a-day idempotence is the same code on both paths.
 */
export async function sendTodaysQuestion(
  store: AppStore,
  rulebookId: string,
): Promise<DripSendReport> {
  const result = await store.dispatch(
    callApi({
      path: DRIP_SEND_NOW_PATH,
      method: "POST",
      body: { rulebook_id: rulebookId, force: true } as never,
    }),
  );
  if (result.error) {
    // NOTHING FAILS SILENTLY: a send that did not happen is reported with its
    // reason, never a spinner that stops.
    throw new Error(
      result.error.message ||
        "Today's question couldn't be sent. Nothing was lost — try again.",
    );
  }
  const data = (result.data ?? {}) as Partial<DripSendReport>;
  return {
    asked: data.asked ?? 0,
    already_asked_today: data.already_asked_today ?? 0,
    not_yet_their_hour: data.not_yet_their_hour ?? 0,
    paused_for_silence: data.paused_for_silence ?? 0,
    fell_back_to_base_question: data.fell_back_to_base_question ?? 0,
    errors: data.errors ?? 0,
  };
}

/**
 * The one sentence to show after a send. Every branch says what actually
 * happened — an "asked 0" pass is never reported as a success.
 */
export function sendOutcomeSentence(report: DripSendReport): {
  ok: boolean;
  sentence: string;
} {
  if (report.asked > 0) {
    return {
      ok: true,
      sentence:
        report.fell_back_to_base_question > 0
          ? "Today's question is on its way. (It went out in its standard wording — we couldn't tailor it this morning.)"
          : "Today's question is on its way.",
    };
  }
  if (report.already_asked_today > 0) {
    return {
      ok: true,
      sentence: "Today's question has already gone out — it's below, waiting for you.",
    };
  }
  if (report.paused_for_silence > 0) {
    return {
      ok: false,
      sentence:
        "Your daily question paused itself because several in a row went unanswered. Start it again and the next one goes out.",
    };
  }
  return {
    ok: false,
    sentence:
      "Nothing was sent. Turn the daily question on first, and make sure this Rulebook is yours.",
  };
}
