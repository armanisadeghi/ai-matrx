/**
 * State logic of the ONE social account input (`components/SocialAccountInput.tsx`), kept pure so it
 * is tested without a screen: what the text means right now, and where the account lookup stands.
 * Validation offers, never blocks: nothing here decides whether a form may save.
 */

import { parseSocialAccount, type ParsedAccount } from "./link";
import type { SocialPlatform } from "./types";

export type OkAccount = Extract<ParsedAccount, { status: "ok" }>;

/** What the text means. `platform` = the person's pick for a bare handle, else the context default. */
export function resolveAccountInput(args: {
  text: string;
  picked?: SocialPlatform | null;
  contextPlatform?: SocialPlatform | null;
}): ParsedAccount {
  return parseSocialAccount(args.text, args.picked ?? args.contextPlatform ?? null);
}

/** The platform picker shows only when a bare handle has no platform from the link or the context. */
export function needsPlatformPick(parsed: ParsedAccount, contextPlatform?: SocialPlatform | null): boolean {
  return parsed.status === "needs_platform" || (parsed.status === "ok" && !parsed.detected && !contextPlatform);
}

/** One account = one key: lookups answered for another key are stale and dropped. */
export function accountKey(account: Pick<OkAccount, "platform" | "handle">): string {
  return `${account.platform}:${account.handle.toLowerCase()}`;
}

export interface FoundAccount {
  profileId: string;
  platform: SocialPlatform;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  hasStoredAvatar: boolean;
  followers: number | null;
  /** cache = already in our store (free); fetched = looked up just now. */
  source: "cache" | "fetched";
}

export type LookupState =
  | { state: "idle" }
  | { state: "checking"; key: string }
  | { state: "found"; key: string; account: FoundAccount }
  | { state: "not_found"; key: string; message: string }
  | { state: "failed"; key: string; message: string };

export type LookupAction =
  | { type: "reset" }
  | { type: "start"; key: string }
  | { type: "found"; key: string; account: FoundAccount }
  | { type: "not_found"; key: string; message: string }
  | { type: "failed"; key: string; message: string }
  /** The free store check found nothing: back to idle, so a blur may do the one paid fetch. */
  | { type: "miss"; key: string };

export function lookupReducer(state: LookupState, action: LookupAction): LookupState {
  if (action.type === "reset") return { state: "idle" };
  if (action.type === "start") return { state: "checking", key: action.key };
  // An answer for an account the person has since edited away from is dropped.
  if (state.state !== "checking" || state.key !== action.key) return state;
  switch (action.type) {
    case "miss":
      return { state: "idle" };
    case "found":
      return { state: "found", key: action.key, account: action.account };
    case "not_found":
      return { state: "not_found", key: action.key, message: action.message };
    case "failed":
      return { state: "failed", key: action.key, message: action.message };
  }
}

/** The lookup result that belongs to the account now in the field, else idle. */
export function lookupFor(state: LookupState, parsed: ParsedAccount): LookupState {
  if (parsed.status !== "ok") return { state: "idle" };
  return state.state !== "idle" && state.key === accountKey(parsed) ? state : { state: "idle" };
}

/** Whether a blur/Enter should start a lookup: only for a complete account not already answered. */
export function shouldLookUp(state: LookupState, parsed: ParsedAccount): boolean {
  if (parsed.status !== "ok") return false;
  const current = lookupFor(state, parsed);
  return current.state === "idle";
}

/** What a form saves from the field: the canonical address and handle, and the found name when known. */
export function savedAccount(
  parsed: ParsedAccount,
  lookup: LookupState,
): { platform: SocialPlatform; handle: string; url: string; displayName: string | null } | null {
  if (parsed.status !== "ok") return null;
  const found = lookupFor(lookup, parsed);
  return {
    platform: parsed.platform,
    handle: parsed.handle,
    url: parsed.url,
    displayName: found.state === "found" ? found.account.displayName.trim() || null : null,
  };
}
