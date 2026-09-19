"use client";

/**
 * lib/extension-bridge/handToOwnBrowser.ts
 *
 * THE ONE CALL that hands this app's queued pages to the person's own Chrome.
 *
 * ── Why this exists, and what it is fixing ──
 *
 * `media.capture_handoff` is org-stamped, and the two ends of that queue
 * resolve "which organization am I?" INDEPENDENTLY: this app from its own
 * active-organization state, the extension from its own stored selection
 * (`matrx-extend/src/lib/org/active-org.ts`). On 2026-09-18 that produced the
 * defect this module exists to end — one person's waiting rows were spread
 * across three of his workspaces, the web app shouted about one of them, and
 * the extension, sitting on a different workspace, showed a perfectly calm
 * "Nothing needs your browser". Neither screen named the workspace it had
 * looked in. A queue you cannot see is worse than a queue that is empty,
 * because the person is told work is waiting and then told it is not.
 *
 * So the organization TRAVELS WITH THE HAND-OFF. The button does not ask the
 * person to go and find the right workspace in a second product; it tells the
 * extension which one to be in, and the extension verifies membership before
 * it switches. There is no guessing on either side.
 *
 * ── What it deliberately does NOT do ──
 *
 * It does not open the page in front of the person. Rung 3 of the capture
 * ladder is the UNATTENDED rung: the extension opens each queued page in a
 * background tab and reads it with the same capture primitives it always uses.
 * Sending someone to facebook.com and leaving them there is not an instruction
 * (owner, 2026-09-18: *"If I click the link, it opens facebook. Great. So
 * what?"*). The only thing that opens is the extension's own panel, so the
 * person can watch the count go down.
 *
 * Wire contract (matrx-extend `src/lib/frontend-bridge/handler.ts`, action
 * `captureHandoff.pickUp`) and the channel map:
 * /Users/armanisadeghi/code/common-docs/systems/clients/extension/CHANNELS.md
 */

import {
  detectExtensionId,
  isChromeRpcAvailable,
  sendChromeRpc,
} from "@/lib/extension-bridge/chrome-rpc";

/** The extension action this module speaks. One string, one place. */
export const CAPTURE_PICK_UP_ACTION = "captureHandoff.pickUp";

export interface HandToOwnBrowserRequest {
  /** The workspace the queued rows belong to. Never optional — see the header. */
  organizationId: string;
  /** The queue's first page, so the panel opens on it. */
  handoffId?: string | undefined;
  url?: string | undefined;
}

/**
 * Every way this can end, each one carrying the sentence a person reads.
 *
 * `no_extension` is a first-class OUTCOME, not an error: not having the
 * extension is a completely normal state with a completely normal remedy, and
 * a red failure toast for it would be the screen lying about whose fault it is.
 */
export type HandToOwnBrowserOutcome =
  | {
      kind: "handed_over";
      organizationName: string;
      organizationSwitched: boolean;
      panelOpened: boolean;
      waitingCount: number;
      sentence: string;
    }
  | { kind: "no_extension"; sentence: string }
  | { kind: "refused"; sentence: string };

interface PickUpResult {
  organizationSwitched?: unknown;
  organizationName?: unknown;
  panelOpened?: unknown;
  panelReason?: unknown;
  waitingCount?: unknown;
}

const NO_EXTENSION_SENTENCE =
  "The Matrx extension is not installed in this browser, so there is nothing to hand the pages to. Adding it takes about a minute and it is the only thing these pages are waiting for.";

/**
 * Is the Matrx extension installed and answering in THIS browser?
 *
 * Answered by asking it (`ping`), never by a stored flag: an extension can be
 * removed, disabled, or updated between one page load and the next, and a
 * remembered "yes" is how a button comes to promise something that is no longer
 * there. Returns the install's id so the caller can keep talking to the same
 * one it found.
 */
export async function findOwnBrowserExtension(): Promise<string | null> {
  if (!isChromeRpcAvailable()) return null;
  const found = await detectExtensionId();
  return found?.id ?? null;
}

/** True when this browser can reach a Matrx extension right now. */
export async function hasOwnBrowserExtension(): Promise<boolean> {
  return (await findOwnBrowserExtension()) !== null;
}

/**
 * Hand the queue over. Never throws: every failure comes back as an outcome
 * with a sentence, because this runs behind a button a non-technical person
 * pressed and "something went wrong" is not an answer.
 */
export async function handToOwnBrowser(
  request: HandToOwnBrowserRequest,
): Promise<HandToOwnBrowserOutcome> {
  if (!request.organizationId) {
    // A hand-off with no workspace is the exact bug this module was written to
    // close, so it is refused here rather than sent and misfiled.
    return {
      kind: "refused",
      sentence:
        "These pages are not attached to a workspace, so we cannot tell your browser where to file what it reads. Nothing was sent — this one is ours to fix.",
    };
  }

  const extensionId = await findOwnBrowserExtension();
  if (!extensionId) {
    return { kind: "no_extension", sentence: NO_EXTENSION_SENTENCE };
  }

  const reply = await sendChromeRpc<PickUpResult>(
    extensionId,
    CAPTURE_PICK_UP_ACTION,
    {
      organizationId: request.organizationId,
      handoffId: request.handoffId,
      url: request.url,
    },
  );

  if (!reply.ok) {
    // The extension answered `ping` a moment ago, so this is a real refusal
    // (not signed in there, not a member of this workspace) or it went away
    // mid-call. Its sentence is written for a person; pass it through rather
    // than replacing it with one of ours that knows less.
    return {
      kind: "refused",
      sentence:
        reply.error ??
        "Your browser's Matrx extension did not answer, so nothing was handed over. Try the button again.",
    };
  }

  const result = reply.result ?? {};
  const organizationName =
    typeof result.organizationName === "string" && result.organizationName
      ? result.organizationName
      : "your workspace";
  const organizationSwitched = result.organizationSwitched === true;
  const panelOpened = result.panelOpened === true;
  const waitingCount =
    typeof result.waitingCount === "number" ? result.waitingCount : 0;

  return {
    kind: "handed_over",
    organizationName,
    organizationSwitched,
    panelOpened,
    waitingCount,
    sentence: handedOverSentence({
      organizationName,
      organizationSwitched,
      panelOpened,
      waitingCount,
    }),
  };
}

/**
 * The receipt, in one sentence.
 *
 * 🚨 `panelOpened: false` is the case worth caring about. Chrome only lets an
 * extension open its side panel in response to a user gesture, and a message
 * from another extension does not count as one — so the panel genuinely may
 * not open, on a click that otherwise worked perfectly. When that happens the
 * sentence says the ONE thing left to do (click the toolbar icon) instead of
 * claiming success and leaving the person looking at nothing. The hand-off
 * itself already happened either way; the browser is reading.
 */
export function handedOverSentence(args: {
  organizationName: string;
  organizationSwitched: boolean;
  panelOpened: boolean;
  waitingCount: number;
}): string {
  const { organizationName, organizationSwitched, panelOpened, waitingCount } =
    args;
  const pages =
    waitingCount === 1 ? "the page" : `all ${waitingCount || ""} pages`.trim();
  const where = organizationSwitched
    ? ` Your extension is now on ${organizationName}.`
    : "";
  if (panelOpened) {
    return `Your browser is reading ${pages} now — the Matrx panel is open so you can watch.${where}`;
  }
  return `Your browser is reading ${pages} now. Click the Matrx icon in your Chrome toolbar to watch it happen.${where}`;
}
