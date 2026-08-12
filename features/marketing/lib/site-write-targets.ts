/**
 * Pure validation core for the `matrx-user/marketing` write target
 * `site_editor_draft`. Kept free of React/services so the two failure modes
 * that matter are provable in unit tests (`site-write-targets.test.ts`):
 *
 *  1. A write landing on the WRONG website. The value names a site by domain,
 *     id, or name; an unknown or ambiguous selector must be REFUSED with the
 *     loaded rows listed, never resolved by guessing.
 *  2. A structured value smuggled into a prose field. The inline-tool layer
 *     parses a JSON-looking argument before the handler sees it, so an agent
 *     that "fixes" a rejection by JSON-encoding lands escaped newlines and
 *     stray quotes in the user's copy. Every message therefore says PLAIN
 *     TEXT, not JSON and not JSON-encoded, in the throw itself.
 *
 * These constants are the ONE contract: the manifest interpolates them into
 * the model-facing target description and the handler enforces them, so what
 * the agent is told and what it is held to cannot drift.
 *
 * The component seam (`components/sites/SitesPortfolio.tsx`) feeds the result
 * into the site editor dialog's own draft state — the user still presses Save.
 */

export const SITE_EDITOR_DRAFT_TARGET = "site_editor_draft";

/** Max display-name length accepted from an agent write. */
export const SITE_NAME_MAX = 200;
/** Max description length accepted from an agent write. */
export const SITE_DESCRIPTION_MAX = 2000;

/** The editable half of the site editor an agent may stage into. */
export interface SiteDraftPatch {
  name?: string;
  description?: string;
}

export interface SiteEditorDraftWrite {
  /** The caller's site selector, trimmed — resolve with `resolveSiteForWrite`. */
  site: string;
  patch: SiteDraftPatch;
}

/** One loaded sites-list row, reduced to what selector matching needs. */
export interface SiteWriteCandidate {
  site_id: string;
  name: string;
  domain: string;
}

const ALLOWED_KEYS = ["site", "name", "description"] as const;

function describeShape(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

/**
 * A prose field must arrive as a real string. An object/array here means the
 * value was JSON that the tool layer already parsed — saying so explicitly is
 * what stops the agent from re-sending it double-encoded.
 */
function asPlainText(value: unknown, key: string): string {
  if (typeof value !== "string") {
    throw new Error(
      `${SITE_EDITOR_DRAFT_TARGET}.${key} must be a plain text string, not JSON and not JSON-encoded — received ${describeShape(
        value,
      )}. Send the finished prose itself as the string value. Nothing was staged.`,
    );
  }
  return value;
}

/**
 * Validate a `site_editor_draft` write value. Throws on any contract break —
 * the writeback seam turns the throw into the error envelope the agent reads,
 * and NOTHING is staged, so a rejected write leaves the page untouched.
 */
export function validateSiteEditorDraftWrite(
  value: unknown,
): SiteEditorDraftWrite {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `${SITE_EDITOR_DRAFT_TARGET} expects an object value like { "site": "example.com", "description": "…" } — received ${describeShape(
        value,
      )}. Nothing was staged.`,
    );
  }

  const obj = value as Record<string, unknown>;
  const allowed = new Set<string>(ALLOWED_KEYS);
  const unknownKeys = Object.keys(obj).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(
      `${SITE_EDITOR_DRAFT_TARGET} does not accept ${unknownKeys
        .map((key) => `"${key}"`)
        .join(", ")}. The only writable keys are ${ALLOWED_KEYS.map(
        (key) => `"${key}"`,
      ).join(
        ", ",
      )} — a site's domain, root URL, owning brand, organization, lifecycle status, visibility and image URLs are deliberately not agent-writable. Nothing was staged.`,
    );
  }

  const site = asPlainText(obj.site, "site").trim();
  if (!site) {
    throw new Error(
      `${SITE_EDITOR_DRAFT_TARGET}.site is required — name the website to edit by its domain (e.g. "example.com"), its site_id, or its exact name from the visible_sites value. Nothing was staged.`,
    );
  }

  const patch: SiteDraftPatch = {};

  if ("name" in obj) {
    const name = asPlainText(obj.name, "name").trim();
    if (!name) {
      throw new Error(
        `${SITE_EDITOR_DRAFT_TARGET}.name cannot be empty — every managed website must keep a display name. Omit the key to leave the current name alone. Nothing was staged.`,
      );
    }
    if (name.length > SITE_NAME_MAX) {
      throw new Error(
        `${SITE_EDITOR_DRAFT_TARGET}.name is ${name.length} characters; the maximum is ${SITE_NAME_MAX}. Nothing was staged.`,
      );
    }
    patch.name = name;
  }

  if ("description" in obj) {
    // An empty string is a deliberate CLEAR (the brand_identity semantics),
    // so it is not trimmed away into "omitted".
    const description = asPlainText(obj.description, "description").trim();
    if (description.length > SITE_DESCRIPTION_MAX) {
      throw new Error(
        `${SITE_EDITOR_DRAFT_TARGET}.description is ${description.length} characters; the maximum is ${SITE_DESCRIPTION_MAX}. Nothing was staged.`,
      );
    }
    patch.description = description;
  }

  if (patch.name === undefined && patch.description === undefined) {
    throw new Error(
      `${SITE_EDITOR_DRAFT_TARGET} needs at least one of "name" or "description" to stage — naming a site alone changes nothing. Nothing was staged.`,
    );
  }

  return { site, patch };
}

/** Domains compare on the bare host: no scheme, no `www.`, no trailing slash. */
function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function listCandidates(candidates: readonly SiteWriteCandidate[]): string {
  return candidates
    .map((candidate) => `"${candidate.domain}" (${candidate.name})`)
    .join(", ");
}

/**
 * Resolve the caller's `site` selector against the rows CURRENTLY LOADED in
 * the sites list. Exact id / domain / name first, then a unique case-
 * insensitive partial; zero matches and ambiguous matches both throw with the
 * real options, so the agent can correct itself instead of guessing.
 */
export function resolveSiteForWrite(
  selector: string,
  candidates: readonly SiteWriteCandidate[],
): SiteWriteCandidate {
  if (candidates.length === 0) {
    throw new Error(
      `${SITE_EDITOR_DRAFT_TARGET} refused — no managed websites are loaded in the sites list right now, so "${selector}" cannot be resolved to a real row. Nothing was staged.`,
    );
  }

  const raw = selector.trim();
  const lower = raw.toLowerCase();
  const asDomain = normalizeDomain(raw);

  const byId = candidates.find((candidate) => candidate.site_id === raw);
  if (byId) return byId;

  const byDomain = candidates.filter(
    (candidate) => normalizeDomain(candidate.domain) === asDomain,
  );
  if (byDomain.length === 1) return byDomain[0];

  const byName = candidates.filter(
    (candidate) => candidate.name.trim().toLowerCase() === lower,
  );
  if (byName.length === 1) return byName[0];

  const partial = candidates.filter(
    (candidate) =>
      normalizeDomain(candidate.domain).includes(asDomain) ||
      candidate.name.toLowerCase().includes(lower),
  );
  if (partial.length === 1) return partial[0];

  if (partial.length > 1 || byDomain.length > 1 || byName.length > 1) {
    const ambiguous = partial.length > 1 ? partial : [...byDomain, ...byName];
    throw new Error(
      `${SITE_EDITOR_DRAFT_TARGET} refused — "${selector}" matches more than one loaded website: ${listCandidates(
        ambiguous,
      )}. Name one exactly by its domain or site_id. Nothing was staged.`,
    );
  }

  throw new Error(
    `${SITE_EDITOR_DRAFT_TARGET} refused — "${selector}" is not a managed website in the currently loaded sites list. Loaded rows: ${listCandidates(
      candidates,
    )}. The list is filtered and paginated, so a site that exists may not be on this page. Nothing was staged.`,
  );
}
