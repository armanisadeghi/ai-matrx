/**
 * The organization seam (PACKAGE-INDEPENDENCE §2.3, slice P7) — the active
 * organization and the ONE gate that asks for one.
 *
 * Same names and shapes the call sites imported from the host app
 * (`selectOrganizationId`, `selectOrganizationName`, `getActiveOrgId`,
 * `ensureOrgId`, `ensureOrganizationContext`, `ensureOrganizationForRequest`,
 * `isOrganizationSelectionCancelled`), so moving a call site onto the org port
 * changed only its import specifier.
 *
 * THE ACTIVE ORGANIZATION IS WHERE WRITES GO AND WHICH ORG A SERVER CALL RUNS
 * IN. It is never a list filter (common-docs/policies/access-ladder.md).
 * It is carried, never rebuilt: an organization the caller already holds wins
 * outright, and nothing here ever picks one for the person
 * (common-docs/policies/context-is-carried-never-rebuilt.md).
 *
 *   - Synchronous reads come from the package's own `chatHost` slice, which the
 *     provider keeps equal to the host's org port.
 *   - With no organization, the gate asks through the port: `org.require`
 *     holds the action, the person chooses, the action continues with the
 *     choice — or rejects as cancelled ("not now"), which callers treat as
 *     nothing happened. A host that cannot ask (the default port) refuses
 *     loudly with the remedy.
 */

import {
  OrganizationContextError,
  requireOrganizationContext,
} from "@ai-matrx/agents/matrx";
import type { ChatOrganization, ChatOrgRequireOptions } from "./contract";
import { getChatHost, isChatHostConfigured } from "./configure";
import { announceOnce } from "./errors";
import { getStoreSingleton } from "../store/store-singleton";

type WithChatHostOrg = { chatHost?: { org?: ChatOrganization | null } } | null | undefined;

function orgOf(state: unknown): ChatOrganization | null {
  return (state as WithChatHostOrg)?.chatHost?.org ?? null;
}

// ── Selectors (any store that mounts `chatHost`) ─────────────────────────────

/** The active organization: where writes go. Never a list filter. */
export const selectActiveOrganization = (state: unknown): ChatOrganization | null =>
  orgOf(state);

export const selectOrganizationId = (state: unknown): string | null => orgOf(state)?.id ?? null;

export const selectOrganizationName = (state: unknown): string | null =>
  orgOf(state)?.name ?? null;

// ── Outside React ────────────────────────────────────────────────────────────

/** The active organization id from the chat store, or null (none chosen, or no store yet). */
export function getActiveOrgId(): string | null {
  const store = getStoreSingleton();
  return store ? orgOf(store.getState())?.id ?? null : null;
}

/**
 * The explicitly selected organization id, or a refusal BEFORE any I/O. Never
 * a personal-organization fallback: a transport that quietly substitutes one
 * files work in an organization the person never chose.
 */
export function requireSelectedOrgId(): string {
  const id = getActiveOrgId();
  if (typeof id !== "string" || id.trim().length === 0) throw refusal();
  return id.trim();
}

/**
 * "The person closed the organization picker" — an ANSWER ("not now"), never a
 * failure: no toast, no error line. Recognised by name, so the host's own
 * cancellation error matches without the package importing it.
 */
export interface OrganizationSelectionCancelledError extends Error {
  name: "OrganizationSelectionCancelled";
  /** Developer-readable; the message is empty so nothing is shown to the person. */
  readonly reason?: string;
}

export function isOrganizationSelectionCancelled(
  error: unknown,
): error is OrganizationSelectionCancelledError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "OrganizationSelectionCancelled"
  );
}

function isMissingOrganization(error: unknown): boolean {
  return (
    error instanceof OrganizationContextError &&
    error.code === "organization_context_required"
  );
}

/** Ask the host. With no host configured there is nobody to ask: say so, and refuse as before. */
function askHost(
  refusal: unknown,
  reason: string,
  options?: ChatOrgRequireOptions,
): Promise<string> {
  if (!isChatHostConfigured()) {
    announceOnce(
      "org:no-host",
      "An organization is required and no chat host is configured to ask for one. " +
        "Wrap the app in <ChatProvider host={{ db, org }}>.",
    );
    return Promise.reject(refusal);
  }
  return getChatHost().org.require(reason, options);
}

function refusal(): OrganizationContextError {
  return new OrganizationContextError(
    "organization_context_required",
    "Select an organization before sending this request.",
  );
}

/**
 * The organization an org-scoped WRITE acts in: the one passed in, else the
 * active one, else the host holds the write and asks — only right after the
 * person acted (a debounced autosave refuses instead of raising a picker).
 */
export async function ensureOrgId(orgId: string | null | undefined): Promise<string> {
  if (orgId) return orgId;
  const active = getActiveOrgId();
  if (active) return active;
  return askHost(refusal(), "write");
}

export interface EnsureOrganizationOptions {
  /** An organization the caller already resolved authoritatively. Wins outright; never asks. */
  organizationId?: string | null;
  /** False: refuse without asking (background work). Default true. */
  interactive?: boolean;
  /** Choices the caller's own refusal already carried, so the picker opens at once. */
  prefetchedOrganizations?: readonly unknown[] | null;
}

/**
 * Resolve the organization for an action, asking the person if we must.
 * Throws a cancellation the person chose ("not now"), or the fail-closed
 * refusal when nobody can be asked.
 */
export async function ensureOrganizationContext(
  options: EnsureOrganizationOptions = {},
): Promise<string> {
  const { organizationId, interactive = true, prefetchedOrganizations = null } = options;
  try {
    return requireOrganizationContext(getActiveOrgId(), organizationId ?? undefined);
  } catch (error) {
    if (!isMissingOrganization(error) || !interactive) throw error;
    return askHost(error, "action", {
      interactive: true,
      prefetched: prefetchedOrganizations,
    });
  }
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The gate for a server request: a write asks, a read refuses without a dialog. */
export function ensureOrganizationForRequest(options: {
  method?: string | null;
  organizationId?: string | null;
  interactive?: boolean;
  prefetchedOrganizations?: readonly unknown[] | null;
}): Promise<string> {
  const method = (options.method ?? "GET").toUpperCase();
  return ensureOrganizationContext({
    organizationId: options.organizationId,
    interactive: options.interactive ?? !READ_METHODS.has(method),
    prefetchedOrganizations: options.prefetchedOrganizations ?? null,
  });
}

// ── Refusals a person reads ──────────────────────────────────────────────────

/** The wire code both servers answer a missing organization with. */
const ORGANIZATION_REQUIRED_WIRE_CODE = "organization_required";

/**
 * True when `error` is the fail-closed "no organization selected" refusal: the
 * kernel's typed error, or the server's `organization_required` code (matched by
 * code, never by message, so a serialized error is still recognised).
 */
export function isOrganizationRequiredError(error: unknown): boolean {
  if (isMissingOrganization(error)) return true;
  return (
    error instanceof Error &&
    (error as { code?: unknown }).code === ORGANIZATION_REQUIRED_WIRE_CODE
  );
}

export const ORGANIZATION_REQUIRED_REMEDY =
  "Every record is filed under one organization, so pick the one you are working in from the avatar menu and try again.";

export interface OrganizationRefusalOptions {
  /** What did NOT happen, as a past participle ("saved", "created"). Defaults to "saved". */
  act?: string;
  /** Names the thing ("This page"); omit and the sentence speaks of "Nothing". */
  subject?: string;
}

/** The sentence a person reads. The negation is this helper's job, never the caller's. */
export function organizationRefusalMessage(options: OrganizationRefusalOptions = {}): string {
  const act = options.act ?? "saved";
  const refusal = options.subject ? `${options.subject} was not ${act}` : `Nothing was ${act}`;
  return `${refusal} because no organization is selected. ${ORGANIZATION_REQUIRED_REMEDY}`;
}

/**
 * Show the refusal if that is what `error` is. True when it handled the error
 * (the caller returns), false when the error is something else.
 */
export function presentOrganizationRefusal(
  error: unknown,
  options: OrganizationRefusalOptions = {},
): boolean {
  if (!isOrganizationRequiredError(error)) return false;
  const description = organizationRefusalMessage(options);
  if (isChatHostConfigured()) {
    getChatHost().notify.error("Choose an organization first", { description });
  } else {
    // Nobody to show it: say so on the console rather than swallow the refusal.
    console.warn(`[chat] Choose an organization first. ${description}`);
  }
  return true;
}

/**
 * Run `work`; if it refuses for want of an organization, show the person the
 * refusal and RETHROW — the caller's own failure path must still run.
 */
export async function withOrganizationRefusalShown<T>(
  act: string,
  work: () => Promise<T>,
  options: Omit<OrganizationRefusalOptions, "act"> = {},
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    presentOrganizationRefusal(error, { ...options, act });
    throw error;
  }
}
