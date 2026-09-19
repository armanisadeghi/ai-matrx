"use client";

/**
 * features/capture-ladder/needsYouAssist.ts
 *
 * THE PRODUCER. Pages waiting for a person's own browser reach that person
 * through the platform's ONE attention primitive — `platform.assists` — and
 * not through a second floating thing in the same corner.
 *
 * ── Why this replaced a bespoke tray (owner ruling, 2026-09-18) ──
 *
 * *"We already have multiple primitives and systems for delivering things like
 * this so a new one should never have been built."* The tray that used to live
 * here had no instant close, no snooze, no never-again, no action button, a
 * card inside a card, and it wrote a paragraph that never said what to do. The
 * assists dock already had every one of those, audited and built: "Not now",
 * the snooze windows, the reversible whole-source mute, a per-user draggable
 * position, one verb-labelled button, and a door to the full list. Re-deriving
 * them badly beside it was the defect.
 *
 * ── ONE assist, never one per page ──
 *
 * The queue is one fact — *your browser is the only thing that can read these*
 * — and one click answers all of it, because rung 3 is unattended: the
 * extension opens each page in a background tab on its own. A row per page
 * would be five chips for one decision, and the rotation rules would show one
 * of them anyway.
 *
 * ── The urgent band, deliberately ──
 *
 * `ASSIST_URGENT_BAR`: *something is blocked or failing and only this person
 * can unblock it*. Pages our scraper and our server browser are locked out of
 * are blocked on exactly one thing in the world: a browser that is already
 * signed in. That is not a backlog and it is not a suggestion. Urgent rows are
 * pinned past the presentation cycle (`features/assists/presentation-cycle.ts`)
 * so a blocker is never rotated behind three treats.
 *
 * Registry: `platform.assist_producer_policy` must carry `capture_ladder.` with
 * `disposition='assist'` and `presentation_enabled` — an unregistered source
 * fails closed and nothing is written.
 */

import {
  filterKeysNotSilencedByAPerson,
  resolveAssistsByDedupeKeys,
} from "@/features/assists/service";
import { emitAssistTracked } from "@/features/assists/redux/emitTracked";
import { assistPriority, type AssistAction } from "@/features/assists/types";
import type { AppDispatch } from "@/lib/redux/store";
import { hasOwnBrowserExtension } from "@/lib/extension-bridge/handToOwnBrowser";
import type { CaptureHandoff } from "@/features/capture-ladder/types";

/** Stable producer id. One family, so the dock's family rule sees one source. */
export const NEEDS_YOU_SOURCE_KEY = "capture_ladder.needs_your_browser";

/** Where a person goes to add or connect the extension. A real, existing page. */
export const EXTENSION_SETUP_ROUTE = "/settings/extension";

/**
 * A backstop only. The producer resolves the row the moment the queue empties;
 * this is what stops a row surviving a client that never got to run again.
 */
const EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

/** At most this many hosts are named before the sentence says "and N more". */
const MAX_NAMED_HOSTS = 2;

export function needsYouDedupeKey(organizationId: string): string {
  return `${NEEDS_YOU_SOURCE_KEY}:${organizationId}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The title: the fact, in one line, with no instruction in it. The instruction
 * is the button's verb and the one explainer sentence above it — saying it
 * three times is what made the old tray unreadable.
 */
export function needsYouTitle(count: number): string {
  return count === 1
    ? "A page is waiting for your browser"
    : `${count} pages are waiting for your browser`;
}

/**
 * The body: WHICH pages, and — only when it changes the promise — that some of
 * them will need the person themselves. Never what the button does; that is
 * the descriptor's job, one line above the button.
 */
export function needsYouBody(
  handoffs: readonly CaptureHandoff[],
  options: { extensionInstalled: boolean },
): string {
  const hosts = [...new Set(handoffs.map((row) => hostOf(row.url)))];
  const named = hosts.slice(0, MAX_NAMED_HOSTS);
  const rest = hosts.length - named.length;
  const list =
    rest > 0
      ? `${named.join(", ")} and ${rest} more`
      : named.length === 2
        ? `${named[0]} and ${named[1]}`
        : (named[0] ?? "These pages");

  const lines = [
    `${list} — these only open for someone who is signed in, and our servers are not.`,
  ];

  if (!options.extensionInstalled) {
    lines.push(
      "Your own Chrome could read them, but the Matrx extension is not installed in this browser yet.",
    );
  }

  const driving = handoffs.filter(
    (row) => row.status === "needs_drive" || row.rung === "human_drive",
  ).length;
  if (driving > 0 && options.extensionInstalled) {
    lines.push(
      driving === 1
        ? "One of them will need you to sign in or click through yourself."
        : `${driving} of them will need you to sign in or click through yourself.`,
    );
  }

  return lines.join(" ");
}

/**
 * The action, which is the whole difference between this and the old tray.
 *
 * With the extension: one click hands the queue over, carrying the WORKSPACE —
 * the fix for the defect that started this (the extension resolves its own
 * active organization, so a hand-off that does not name one lands in a queue
 * read the person never sees).
 *
 * Without it: the button is honest about being a different button. It does not
 * promise a capture it cannot perform, and it does not send anybody to the page
 * itself, which teaches nothing.
 */
export function needsYouAction(args: {
  organizationId: string;
  first: CaptureHandoff | undefined;
  extensionInstalled: boolean;
}): AssistAction {
  if (!args.extensionInstalled) {
    return {
      kind: "navigate",
      href: EXTENSION_SETUP_ROUTE,
      label: "Add the extension",
      confirm:
        "Shows you how to add the Matrx extension to this browser and connect it to your account. Your queued pages stay exactly where they are.",
      receipt: "Add the extension here, then come back and press the button.",
    };
  }
  return {
    kind: "open_in_own_browser",
    organizationId: args.organizationId,
    handoffId: args.first?.id,
    url: args.first?.url,
  };
}

export interface ProduceNeedsYouArgs {
  userId: string;
  organizationId: string;
  handoffs: readonly CaptureHandoff[];
  dispatch: AppDispatch;
  /** Injected so the sweep is testable without a Chrome runtime. */
  detectExtension?: () => Promise<boolean>;
}

/**
 * One sweep. Emits (or refreshes) the single row for this organization, or
 * RESOLVES it when the queue is empty.
 *
 * 🚨 Resolving matters as much as emitting. `resolved` is the status for "the
 * condition stopped reproducing and nobody had to decide anything" — exactly
 * what a captured page is. Without it the chip would sit there claiming work
 * that is already done, which is the same lie as a queue that hides work.
 */
export async function produceNeedsYouAssist(
  args: ProduceNeedsYouArgs,
): Promise<"emitted" | "resolved" | "skipped"> {
  const { userId, organizationId, handoffs, dispatch } = args;
  if (!userId || !organizationId) return "skipped";

  const dedupeKey = needsYouDedupeKey(organizationId);

  if (handoffs.length === 0) {
    await resolveAssistsByDedupeKeys([dedupeKey]);
    return "resolved";
  }

  // A durable decision is durable: someone who dismissed this for good is not
  // asked again — that is the whole meaning of the button.
  //
  // 🚨 But ONLY a DISMISSAL silences, which is why this is not the usual
  // `filterUndecidedKeys`. This producer's key is stable per workspace, so
  // under the usual gate two ordinary outcomes would each silence a workspace
  // for ever: `resolved`, which this producer writes itself the moment the
  // queue empties, and `accepted`, which is the person PRESSING THE BUTTON.
  // Both happened within minutes of this going live. A queue that goes quiet
  // because it worked is worse than one that never worked.
  const undecided = await filterKeysNotSilencedByAPerson([dedupeKey]);
  if (undecided.length === 0) return "skipped";

  const detect = args.detectExtension ?? hasOwnBrowserExtension;
  const extensionInstalled = await detect();

  await emitAssistTracked(
    userId,
    {
      sourceKey: NEEDS_YOU_SOURCE_KEY,
      title: needsYouTitle(handoffs.length),
      body: needsYouBody(handoffs, { extensionInstalled }),
      action: needsYouAction({
        organizationId,
        first: handoffs[0],
        extensionInstalled,
      }),
      dedupeKey,
      expiresAt: new Date(Date.now() + EXPIRES_MS).toISOString(),
      // Rank inside the band: more pages waiting sorts first. Clamped by the
      // helper, so a producer can never spill into a band it did not earn.
      priority: assistPriority("urgent", Math.min(handoffs.length, 9)),
    },
    dispatch,
  );
  return "emitted";
}

