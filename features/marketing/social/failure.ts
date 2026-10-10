/**
 * What a refused social read means to a person, in their words. Pure.
 *
 * The server's refusal carries a code and a vendor sentence; neither belongs on a screen. A tile or dialog that
 * could not read a page shows `title` + `reason` and the actions it offers: Try again (a hiccup), and the gated
 * capture ways (the person's own browser) for a page the data provider cannot read at all.
 */

import { socialErrorCode, socialErrorMessage, socialErrorUserCode } from "./server";

export type SocialFailureKind = "restricted" | "busy" | "other";

export interface SocialFailure {
  kind: SocialFailureKind;
  title: string;
  /** One short sentence in user terms; never a vendor, a code or a cache key. */
  reason: string;
  /** Trying the same read again can help. */
  canRetry: boolean;
  /** Reading it through the person's own browser can help (see GATED-CAPTURE.md). */
  canCapture: boolean;
}

export function describeSocialFailure(error: unknown, fallback = "That could not be read."): SocialFailure {
  const code = socialErrorCode(error);
  const why = socialErrorUserCode(error);
  if (why === "unsupported_platform") {
    return { kind: "other", title: "Not available yet", reason: socialErrorMessage(error, fallback), canRetry: false, canCapture: false };
  }
  if (why === "not_found") {
    return { kind: "other", title: "Couldn't find it", reason: socialErrorMessage(error, fallback), canRetry: false, canCapture: false };
  }
  if (why === "private" || why === "restricted") {
    return {
      kind: "restricted",
      title: why === "private" ? "Looks private" : "Can't read this page",
      reason: socialErrorMessage(error, fallback),
      canRetry: why === "private",
      canCapture: true,
    };
  }
  if (why === "blocked" || why === "temporarily_unavailable") {
    return {
      kind: "busy",
      title: "Didn't load just now",
      reason: socialErrorMessage(error, fallback),
      canRetry: true,
      canCapture: true,
    };
  }
  if (code === "social_not_found") {
    return {
      kind: "restricted",
      title: "Can't read this page",
      reason: "It's private or restricted, so it can't be read the usual way.",
      canRetry: false,
      canCapture: true,
    };
  }
  if (code === "social_provider_failed") {
    return {
      kind: "busy",
      title: "Didn't load just now",
      reason: "Trying again usually works. If it keeps failing, read it through your own browser.",
      canRetry: true,
      canCapture: true,
    };
  }
  return {
    kind: "other",
    title: "Couldn't read this",
    reason: socialErrorMessage(error, fallback),
    canRetry: true,
    canCapture: false,
  };
}
