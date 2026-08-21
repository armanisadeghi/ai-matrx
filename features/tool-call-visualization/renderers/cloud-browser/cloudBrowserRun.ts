import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  CircleAlert,
  Compass,
  KeyRound,
  ListChecks,
  LogOut,
  MousePointer2,
  ScanSearch,
  ScrollText,
  ShieldCheck,
  TextCursorInput,
  Timer,
  View,
} from "lucide-react";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { MediaRef } from "@/features/files/types";
import { coerceMediaRef } from "../../result-fields/shape";
import { getArg, resultAsObject } from "../_shared";

const LEGACY_BROWSER_ACTIONS: Readonly<Record<string, string>> = {
  cloud_browser_navigate: "navigate",
  cloud_browser_click: "click",
  cloud_browser_type: "type_text",
  cloud_browser_type_text: "type_text",
  cloud_browser_select_option: "select_option",
  cloud_browser_wait_for: "wait_for",
  cloud_browser_get_element: "get_element",
  cloud_browser_scroll: "scroll",
  cloud_browser_screenshot: "screenshot",
  cloud_browser_close: "close",
};

export interface CloudBrowserActivity {
  action: string;
  label: string;
  icon: LucideIcon;
  iconClassName: string;
  url: string | null;
  media: MediaRef | null;
  isError: boolean;
  isActive: boolean;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compact(value: string, max = 88): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length > max
    ? `${singleLine.slice(0, Math.max(1, max - 1)).trimEnd()}…`
    : singleLine;
}

function quoted(value: string | null): string | null {
  return value ? `“${compact(value, 64)}”` : null;
}

function pageLabel(url: string | null, title: string | null): string | null {
  if (title) return compact(title, 72);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return compact(`${parsed.hostname.replace(/^www\./, "")}${path}`, 72);
  } catch {
    return compact(url, 72);
  }
}

function activityState(entry: ToolLifecycleEntry) {
  return {
    isError: entry.status === "error",
    isActive:
      entry.status === "started" ||
      entry.status === "progress" ||
      entry.status === "step",
  };
}

export function cloudBrowserAction(entry: ToolLifecycleEntry): string | null {
  if (entry.toolName === "cloud_browser") {
    return nonEmptyString(getArg(entry, "action"));
  }
  if (entry.toolName === "credential_login") {
    const action = nonEmptyString(getArg(entry, "action"));
    return action ? `credential:${action}` : "credential:auto";
  }
  return LEGACY_BROWSER_ACTIONS[entry.toolName] ?? null;
}

export function isCloudBrowserToolName(
  toolName: string | null | undefined,
): boolean {
  return (
    toolName === "cloud_browser" ||
    toolName === "credential_login" ||
    (typeof toolName === "string" &&
      LEGACY_BROWSER_ACTIONS[toolName] !== undefined)
  );
}

export function isCloudBrowserEntry(entry: ToolLifecycleEntry): boolean {
  return isCloudBrowserToolName(entry.toolName);
}

export function isCloudBrowserRun(entries: ToolLifecycleEntry[]): boolean {
  return entries.length > 0 && entries.every(isCloudBrowserEntry);
}

export function cloudBrowserRunId(
  entries: ToolLifecycleEntry[],
): string | null {
  for (const entry of entries) {
    const result = resultAsObject(entry);
    const fromResult =
      nonEmptyString(result?.session_id) ?? nonEmptyString(result?.run_id);
    if (fromResult) return fromResult;
    const fromArgs = nonEmptyString(getArg(entry, "session_id"));
    if (fromArgs) return fromArgs;
  }
  return null;
}

export function cloudBrowserProfileId(
  entries: ToolLifecycleEntry[],
): string | null {
  for (const entry of entries) {
    const result = resultAsObject(entry);
    const fromResult = nonEmptyString(result?.profile_id);
    if (fromResult) return fromResult;
    const fromArgs = nonEmptyString(getArg(entry, "profile_id"));
    if (fromArgs) return fromArgs;
  }
  return null;
}

export function cloudBrowserLatestPage(entries: ToolLifecycleEntry[]): {
  url: string | null;
  title: string | null;
} {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry) continue;
    const result = resultAsObject(entry);
    const url =
      nonEmptyString(result?.url) ??
      nonEmptyString(result?.current_url) ??
      nonEmptyString(getArg(entry, "url"));
    const title = nonEmptyString(result?.title);
    if (url || title) return { url, title };
  }
  return { url: null, title: null };
}

function browserActionActivity(
  entry: ToolLifecycleEntry,
  action: string,
): CloudBrowserActivity {
  const result = resultAsObject(entry);
  const state = activityState(entry);
  const url =
    nonEmptyString(result?.url) ??
    nonEmptyString(result?.current_url) ??
    nonEmptyString(getArg(entry, "url"));
  const title = nonEmptyString(result?.title);
  const page = pageLabel(url, title);
  const selector =
    nonEmptyString(getArg(entry, "selector")) ??
    nonEmptyString(result?.selector);
  const selectorLabel = quoted(selector);
  const failedLabel = entry.errorMessage
    ? compact(entry.errorMessage, 100)
    : "Browser action failed";

  if (state.isError) {
    return {
      action,
      label: failedLabel,
      icon: CircleAlert,
      iconClassName: "text-destructive",
      url,
      media: null,
      ...state,
    };
  }

  switch (action) {
    case "navigate":
      return {
        action,
        label: state.isActive
          ? `Opening ${page ?? "a page"}`
          : `Opened ${page ?? "a page"}`,
        icon: Compass,
        iconClassName: "text-info",
        url,
        media: null,
        ...state,
      };
    case "click":
      return {
        action,
        label: state.isActive
          ? `Clicking ${selectorLabel ?? "the page"}`
          : `Clicked ${selectorLabel ?? page ?? "the page"}`,
        icon: MousePointer2,
        iconClassName: "text-primary",
        url,
        media: null,
        ...state,
      };
    case "type_text":
      return {
        action,
        label: state.isActive
          ? `Entering text${selectorLabel ? ` in ${selectorLabel}` : ""}`
          : `Entered text${selectorLabel ? ` in ${selectorLabel}` : ""}`,
        icon: TextCursorInput,
        iconClassName: "text-primary",
        url,
        media: null,
        ...state,
      };
    case "select_option": {
      const option =
        nonEmptyString(getArg(entry, "label")) ??
        nonEmptyString(getArg(entry, "value"));
      return {
        action,
        label: state.isActive
          ? `Selecting ${quoted(option) ?? "an option"}`
          : `Selected ${quoted(option) ?? "an option"}`,
        icon: ListChecks,
        iconClassName: "text-info",
        url,
        media: null,
        ...state,
      };
    }
    case "wait_for": {
      const target =
        quoted(nonEmptyString(getArg(entry, "text"))) ?? selectorLabel;
      return {
        action,
        label: state.isActive
          ? `Waiting for ${target ?? "the page"}`
          : `Waited for ${target ?? "the page"}`,
        icon: Timer,
        iconClassName: "text-warning",
        url,
        media: null,
        ...state,
      };
    }
    case "get_element": {
      const found = result?.found !== false;
      const text = nonEmptyString(result?.text);
      return {
        action,
        label: state.isActive
          ? `Reading ${selectorLabel ?? "the page"}`
          : found
            ? `Read ${selectorLabel ?? "the page"}${text ? ` · ${quoted(text)}` : ""}`
            : `Couldn’t find ${selectorLabel ?? "that element"}`,
        icon: ScanSearch,
        iconClassName: found ? "text-info" : "text-warning",
        url,
        media: null,
        ...state,
      };
    }
    case "scroll": {
      const direction =
        nonEmptyString(getArg(entry, "direction")) ??
        nonEmptyString(result?.direction) ??
        "down";
      const pixels =
        finiteNumber(getArg(entry, "amount_px")) ??
        finiteNumber(result?.pixels);
      return {
        action,
        label: state.isActive
          ? `Scrolling ${direction}`
          : `Scrolled ${direction}${pixels ? ` ${pixels.toLocaleString()} px` : ""}`,
        icon: ScrollText,
        iconClassName: "text-primary",
        url,
        media: null,
        ...state,
      };
    }
    case "screenshot":
      return {
        action,
        label: state.isActive
          ? "Capturing a screenshot"
          : "Captured a screenshot",
        icon: View,
        iconClassName: "text-info",
        url,
        media: coerceMediaRef(entry.result),
        ...state,
      };
    case "close":
      return {
        action,
        label: state.isActive ? "Closing the browser" : "Closed the browser",
        icon: LogOut,
        iconClassName: "text-muted-foreground",
        url: null,
        media: null,
        ...state,
      };
    default:
      return {
        action,
        label: state.isActive ? "Using the browser" : "Used the browser",
        icon: Compass,
        iconClassName: "text-primary",
        url,
        media: null,
        ...state,
      };
  }
}

function credentialActivity(
  entry: ToolLifecycleEntry,
  action: string,
): CloudBrowserActivity {
  const result = resultAsObject(entry);
  const state = activityState(entry);
  const status = nonEmptyString(result?.status);
  const url = nonEmptyString(result?.current_url);

  if (state.isError) {
    return {
      action,
      label: entry.errorMessage
        ? compact(entry.errorMessage, 100)
        : "Secure sign-in failed",
      icon: CircleAlert,
      iconClassName: "text-destructive",
      url,
      media: null,
      ...state,
    };
  }

  const completedLabel = (() => {
    if (status === "authenticated") return "Signed in securely";
    if (status === "needs_mfa") return "Sign-in needs two-step verification";
    if (status === "credentials_rejected") return "Saved sign-in was rejected";
    if (status === "no_matching_login")
      return "No saved sign-in matched this site";
    if (status === "selection_required")
      return "Several saved sign-ins match this site";
    if (status === "spec_incomplete")
      return "Secure sign-in needs more page details";
    if (status === "captcha_or_takeover") return "Sign-in needs your help";
    if (status === "unsafe_destination")
      return "Protected sign-in was blocked for this site";
    switch (action) {
      case "credential:list": {
        const count = Array.isArray(result?.items) ? result.items.length : null;
        return count === null
          ? "Checked saved sign-ins"
          : `Found ${count} saved ${count === 1 ? "sign-in" : "sign-ins"}`;
      }
      case "credential:discover":
        return "Prepared a secure sign-in";
      case "credential:attempt":
      case "credential:auto":
        return "Completed a secure sign-in attempt";
      case "credential:authenticator":
        return "Completed two-step verification securely";
      case "credential:report":
        return "Reported a secure sign-in issue";
      default:
        return "Used Credential Login";
    }
  })();

  const activeLabel = (() => {
    switch (action) {
      case "credential:list":
        return "Checking saved sign-ins";
      case "credential:discover":
        return "Preparing a secure sign-in";
      case "credential:authenticator":
        return "Completing two-step verification securely";
      case "credential:report":
        return "Reporting a secure sign-in issue";
      default:
        return "Signing in securely with Credential Login";
    }
  })();

  const warning =
    status === "needs_mfa" ||
    status === "credentials_rejected" ||
    status === "no_matching_login" ||
    status === "selection_required" ||
    status === "spec_incomplete" ||
    status === "captcha_or_takeover" ||
    status === "unsafe_destination";

  return {
    action,
    label: state.isActive ? activeLabel : completedLabel,
    icon:
      action === "credential:authenticator"
        ? ShieldCheck
        : status === "authenticated"
          ? BadgeCheck
          : warning
            ? CircleAlert
            : KeyRound,
    iconClassName:
      status === "authenticated"
        ? "text-success"
        : warning
          ? "text-warning"
          : "text-primary",
    url,
    media: null,
    ...state,
  };
}

export function cloudBrowserActivity(
  entry: ToolLifecycleEntry,
): CloudBrowserActivity {
  const action = cloudBrowserAction(entry) ?? "browser";
  return action.startsWith("credential:")
    ? credentialActivity(entry, action)
    : browserActionActivity(entry, action);
}

export function cloudBrowserRunTitle(entries: ToolLifecycleEntry[]): string {
  const anyActive = entries.some((entry) => activityState(entry).isActive);
  if (anyActive) {
    return entries.length === 1
      ? "Agent initiating Cloud Browser"
      : "Agent browsing with Cloud Browser";
  }
  const lastEntry = entries.at(-1);
  const lastAction = lastEntry ? cloudBrowserAction(lastEntry) : null;
  return lastAction === "close"
    ? "Cloud Browser session finished"
    : "Agent used Cloud Browser";
}

export function cloudBrowserRunSubtitle(
  entries: ToolLifecycleEntry[],
): string | null {
  const page = cloudBrowserLatestPage(entries);
  const label = pageLabel(page.url, page.title);
  const count = entries.length;
  if (label) return `${label} · ${count} ${count === 1 ? "action" : "actions"}`;
  return `${count} ${count === 1 ? "action" : "actions"}`;
}

export function rawEntryObject(
  entry: ToolLifecycleEntry,
): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    tool: entry.toolName,
    status: entry.status,
    input: entry.arguments,
  };
  if (entry.result !== null && entry.result !== undefined)
    raw.result = entry.result;
  if (entry.errorType) raw.error_type = entry.errorType;
  if (entry.errorMessage) raw.error_message = entry.errorMessage;
  if (entry.latestMessage) raw.latest_message = entry.latestMessage;
  if (entry.latestData) raw.latest_data = entry.latestData;
  return raw;
}
