"use client";

/**
 * THE one place a person enters a social account: a single "Handle or link" field. Any way of writing
 * it works (see `parseSocialAccount`), the platform comes from a pasted link (a platform picker only
 * shows for a bare handle with no context), the normalized account shows live under the field, and
 * leaving the field looks the account up (free from our store when cached, otherwise one profile
 * fetch). A failed or refused lookup says so and never blocks the form: validation offers, never blocks.
 *
 *   const input = useSocialAccountInput({ contextPlatform: "tiktok", organizationId });
 *   <SocialAccountInput input={input} />       // input.account = what to save, or null
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Loader2, UserRound } from "lucide-react";

import { Field, Select, type SelectOption } from "@ai-matrx/design-system/controls";
import { formatCount } from "@ai-matrx/kit/format";

import {
  accountKey,
  lookupFor,
  lookupReducer,
  needsPlatformPick,
  resolveAccountInput,
  savedAccount,
  shouldLookUp,
  type LookupState,
} from "../account-input";
import { fetchAccount, findCachedAccount } from "../account-lookup";
import { useSocialSpend } from "../cost";
import type { ParsedAccount } from "../link";
import { profileAvatarDoor, socialErrorCode, socialErrorMessage } from "../server";
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABELS, type SocialPlatform } from "../types";
import { isRawChannelId } from "../mappers";
import { PlatformMark } from "./PlatformMark";
import { SocialImage } from "./SocialImage";

// The design-system Select has no placeholder prop: "nothing picked" is a real
// option whose label reads "Platform".
const PICK_OPTIONS: SelectOption<SocialPlatform | "">[] = [
  { value: "", label: "Platform" },
  ...SOCIAL_PLATFORMS.map((p) => ({
    value: p,
    label: SOCIAL_PLATFORM_LABELS[p],
  })),
];

export function useSocialAccountInput(args: {
  initialText?: string;
  /** Controlled text (a form that holds the value itself): pass both. */
  text?: string;
  onTextChange?: (text: string) => void;
  /** The platform a bare handle means (a dialog's chosen Type). Null = ask. */
  contextPlatform?: SocialPlatform | null;
  /** Needed for the paid fetch; without it only the free stored-profile check runs. */
  organizationId?: string | null;
}) {
  const { contextPlatform = null, organizationId } = args;
  const [innerText, setInnerText] = useState(args.initialText ?? "");
  const text = args.text ?? innerText;
  const setText = args.onTextChange ?? setInnerText;
  const [picked, setPicked] = useState<SocialPlatform | null>(null);
  const [raw, dispatch] = useReducer(lookupReducer, { state: "idle" } as LookupState);
  const spend = useSocialSpend(organizationId);
  const cacheChecked = useRef<string | null>(null);

  const parsed = useMemo(
    () => resolveAccountInput({ text, picked, contextPlatform }),
    [text, picked, contextPlatform],
  );
  const lookup = lookupFor(raw, parsed);
  const key = parsed.status === "ok" ? accountKey(parsed) : null;

  // Free check as soon as the account is complete: already in our store?
  useEffect(() => {
    if (parsed.status !== "ok" || !key || cacheChecked.current === key) return;
    const account = parsed;
    const timer = setTimeout(() => {
      cacheChecked.current = key;
      dispatch({ type: "start", key });
      findCachedAccount(account).then(
        (found) => dispatch(found ? { type: "found", key, account: found } : { type: "miss", key }),
        () => dispatch({ type: "miss", key }),
      );
    }, 450);
    return () => clearTimeout(timer);
  }, [key, parsed]);

  // Leaving the field (or Enter): the one paid fetch, only when nothing answered yet.
  const check = useCallback(async () => {
    if (parsed.status !== "ok" || !key || !organizationId) return;
    if (!shouldLookUp(raw, parsed)) return;
    const account = parsed;
    if (!(await spend.confirmSpend("profile_page", 1, { title: "Look up this account?", confirmLabel: "Look up" }))) return;
    dispatch({ type: "start", key });
    try {
      const found = await fetchAccount({ account, organizationId });
      dispatch({ type: "found", key, account: found });
    } catch (error) {
      const code = socialErrorCode(error);
      const gone = code === "social_not_found" || code === "social_profile_empty" || code === "social_profile_mismatch";
      dispatch({
        type: gone ? "not_found" : "failed",
        key,
        message: socialErrorMessage(error, gone ? "Couldn't find that account" : "Couldn't look that account up"),
      });
    }
  }, [parsed, key, raw, organizationId, spend]);

  return {
    text,
    setText,
    picked,
    setPicked,
    contextPlatform,
    parsed,
    lookup,
    check,
    lookCost: spend.costText("profile_page", 1),
    canFetch: Boolean(organizationId),
    /** What to save, or null while the field is not a complete account. */
    account: savedAccount(parsed, raw),
    reset: () => {
      setText("");
      setPicked(null);
      cacheChecked.current = null;
      dispatch({ type: "reset" });
    },
  };
}

export type SocialAccountInputState = ReturnType<typeof useSocialAccountInput>;

export function SocialAccountInput({
  input,
  id,
  label,
  autoFocus,
  disabled,
  onEnter,
  className,
}: {
  input: SocialAccountInputState;
  id?: string;
  /** Accessible name and placeholder when the field is one of several ("Instagram handle or link"). */
  label?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Enter in the field, after the lookup started. */
  onEnter?: () => void;
  className?: string;
}) {
  const { parsed, lookup, contextPlatform } = input;
  const showPicker = needsPlatformPick(parsed, contextPlatform);
  return (
    <div className={className} data-testid="social-account-input">
      <div className="flex gap-2">
        <Field
          id={id}
          aria-label={label ?? "Handle or link"}
          // ui-exception: a handle or address is a raw value, not prose
          placeholder={label ?? "@handle or profile link"}
          value={input.text}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(event) => input.setText(event.target.value)}
          onBlur={() => void input.check()}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            void input.check();
            onEnter?.();
          }}
          className="min-w-0 flex-1"
        />
        {showPicker ? (
          <Select
            aria-label="Platform"
            value={input.picked ?? ""}
            options={PICK_OPTIONS}
            onValueChange={(value) => input.setPicked(value === "" ? null : value)}
            disabled={disabled}
            className="w-32 shrink-0"
          />
        ) : null}
      </div>
      <AccountPreview parsed={parsed} lookup={lookup} lookCost={input.lookCost} canFetch={input.canFetch} onLookUp={() => void input.check()} />
    </div>
  );
}

/** One fixed-height line under the field: never shifts the form. */
function AccountPreview({
  parsed,
  lookup,
  lookCost,
  canFetch,
  onLookUp,
}: {
  parsed: ParsedAccount;
  lookup: LookupState;
  lookCost: string | null;
  canFetch: boolean;
  onLookUp: () => void;
}) {
  let body: React.ReactNode = null;
  if (parsed.status === "ok") {
    const found = lookup.state === "found" ? lookup.account : null;
    // A bare channel id is an address, never a name.
    const rawId = isRawChannelId(parsed.handle);
    body = (
      <>
        <PlatformMark platform={parsed.platform} size={16} />
        {found ? (
          <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full">
            <SocialImage
              door={found.hasStoredAvatar ? profileAvatarDoor(found.profileId) : null}
              url={found.avatarUrl}
              alt={found.displayName}
              fallback={<UserRound className="h-5 w-5 text-muted-foreground" aria-hidden />}
            />
          </span>
        ) : null}
        <span className="min-w-0 max-w-[45%] truncate font-medium text-foreground">{found?.displayName ?? (rawId ? "YouTube channel" : parsed.label)}</span>
        {found && !rawId ? <span className="shrink-0 text-muted-foreground">{parsed.label}</span> : null}
        {found?.followers != null ? (
          <span className="shrink-0 text-muted-foreground">{formatCount(found.followers)} followers</span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-muted-foreground" title={parsed.url}>
          {parsed.url.replace(/^https:\/\//, "")}
        </span>
        <span className="shrink-0">
          {lookup.state === "checking" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Checking" />
          ) : lookup.state === "not_found" || lookup.state === "failed" ? (
            <span className="text-destructive" title={lookup.message} data-testid="account-lookup-problem">
              {lookup.state === "not_found" ? "Not found" : "Not checked"}
            </span>
          ) : lookup.state === "idle" && canFetch ? (
            <button type="button" className="text-primary hover:underline" onClick={onLookUp}>
              {lookCost ? `Look up · ${lookCost}` : "Look up"}
            </button>
          ) : null}
        </span>
      </>
    );
  } else if (parsed.status === "needs_platform") {
    body = <span className="text-muted-foreground">@{parsed.handle} · pick a platform</span>;
  } else if (parsed.status === "post") {
    body = <span className="text-muted-foreground">That is a post link, not an account</span>;
  } else if (parsed.status === "invalid") {
    body = <span className="text-muted-foreground">Not an account address</span>;
  }
  return (
    <div
      className="mt-1.5 flex h-6 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs"
      aria-live="polite"
      data-testid="social-account-preview"
    >
      {body}
    </div>
  );
}

/** The input for a form that holds the text itself (one per platform in a list of handles). */
export function SocialAccountField({
  value,
  onChange,
  contextPlatform,
  organizationId,
  ...rest
}: {
  label?: string;
  value: string;
  onChange: (text: string) => void;
  contextPlatform?: SocialPlatform | null;
  organizationId?: string | null;
  id?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  onEnter?: () => void;
  className?: string;
}) {
  const input = useSocialAccountInput({ text: value, onTextChange: onChange, contextPlatform, organizationId });
  return <SocialAccountInput input={input} {...rest} />;
}
