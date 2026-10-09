"use client";

/**
 * lib/extension-bridge/guideCapture.ts
 *
 * "Take me there": ask the person's own Matrx extension to open a capture
 * job's page in front of them, with the on-page guide drawn on it. The
 * counterpart of `handToOwnBrowser` (which is the UNATTENDED path: pages are
 * read in background tabs). Here the person drives, so the extension opens the
 * page itself — a tab opened by the extension is tied to the job, which a plain
 * `window.open` could not be.
 *
 * Wire contract: matrx-extend `src/lib/frontend-bridge/handler.ts`, action
 * `captureHandoff.guide`. The organization travels with the request and the
 * extension verifies membership before it switches (same rule as pickUp).
 *
 * Never throws: every ending is an outcome with the sentence a person reads.
 */

import {
  findOwnBrowserExtension,
} from "@/lib/extension-bridge/handToOwnBrowser";
import {
  forgetRememberedExtensionId,
  getRememberedExtensionId,
  sendChromeRpc,
} from "@/lib/extension-bridge/chrome-rpc";

export const CAPTURE_GUIDE_ACTION = "captureHandoff.guide";

export type GuideCaptureOutcome =
  | { kind: "opened"; organizationName: string; sentence: string }
  | { kind: "no_extension"; sentence: string }
  | { kind: "refused"; sentence: string };

const NO_EXTENSION_SENTENCE =
  "To take you there, Matrx needs its browser extension. Adding it takes about a minute.";

export async function guideCapture(request: {
  organizationId: string;
  handoffId: string;
}): Promise<GuideCaptureOutcome> {
  if (!request.organizationId || !request.handoffId) {
    return {
      kind: "refused",
      sentence: "This capture is missing its workspace, so nothing was opened. This one is ours to fix.",
    };
  }
  const extensionId =
    getRememberedExtensionId() ?? (await findOwnBrowserExtension());
  if (!extensionId) {
    return { kind: "no_extension", sentence: NO_EXTENSION_SENTENCE };
  }
  const reply = await sendChromeRpc<{ organizationName?: unknown }>(
    extensionId,
    CAPTURE_GUIDE_ACTION,
    { organizationId: request.organizationId, handoffId: request.handoffId },
  );
  if (!reply.ok) {
    forgetRememberedExtensionId();
    return {
      kind: "refused",
      sentence:
        reply.error ??
        "Your browser's Matrx extension did not answer, so the page was not opened. Try again.",
    };
  }
  const name =
    typeof reply.result?.organizationName === "string" && reply.result.organizationName
      ? reply.result.organizationName
      : "your workspace";
  return {
    kind: "opened",
    organizationName: name,
    sentence: "The page is open in a new tab. Follow the steps in the Matrx guide on it.",
  };
}
