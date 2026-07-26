// features/admin/applications/config/schema.ts
//
// Client-side Zod schema mirroring AppConfigV1 (the payload contract in
// common-docs/app-config/FEATURE.md) plus the parse/compose helpers the
// editor uses to guarantee unknown (forward-compat) keys round-trip
// unchanged. Adding keys to the payload is free for consumers — this editor
// must therefore never drop a key it doesn't know about.

import { z } from "zod";

/** App slugs: lowercase kebab, 2-63 chars, starts alphanumeric. */
export const APP_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,62}$/;

/** Strict x.y.z semver (no pre-release/build tags — release versions only). */
export const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

/** Server URLs shipped to every installed client MUST be https. */
export const httpsUrlSchema = z
  .url({ error: "Must be a valid URL" })
  .refine((value) => value.startsWith("https://"), {
    error: "Must be an https:// URL",
  });

export const NOTICE_LEVELS = ["info", "warning", "critical"] as const;
export type NoticeLevel = (typeof NOTICE_LEVELS)[number];

export const noticeSchema = z.object({
  level: z.enum(NOTICE_LEVELS),
  title: z.string().min(1, { error: "Notice title is required" }),
  body: z.string().min(1, { error: "Notice body is required" }),
  url: httpsUrlSchema.optional(),
});

export type AppConfigNotice = z.infer<typeof noticeSchema>;

/**
 * AppConfigV1 — known keys are strict; unknown keys pass through untouched
 * (forward compatibility: consumers parse tolerantly, so may the editor).
 */
export const appConfigV1Schema = z
  .object({
    aidream_server_url: httpsUrlSchema,
    matrx_files_url: httpsUrlSchema,
    scraper_server_url: httpsUrlSchema,
    flags: z.record(z.string(), z.boolean()),
    notice: noticeSchema.nullable(),
  })
  .catchall(z.unknown());

export type AppConfigV1 = z.infer<typeof appConfigV1Schema>;

export const URL_KEYS = [
  "aidream_server_url",
  "matrx_files_url",
  "scraper_server_url",
] as const;
export type UrlKey = (typeof URL_KEYS)[number];

export const URL_KEY_LABELS: Record<UrlKey, string> = {
  aidream_server_url: "aidream server URL",
  matrx_files_url: "Matrx Files URL",
  scraper_server_url: "Scraper server URL",
};

const KNOWN_CONFIG_KEYS = new Set<string>([...URL_KEYS, "flags", "notice"]);

const KNOWN_NOTICE_KEYS = new Set<string>(["level", "title", "body", "url"]);

/** Editable notice draft (enabled=false ⇔ notice: null in the payload). */
export interface NoticeDraft {
  enabled: boolean;
  level: NoticeLevel;
  title: string;
  body: string;
  url: string;
  /** Unknown keys inside `notice` — round-trip unchanged, like top-level extras. */
  extras: Record<string, unknown>;
}

export const EMPTY_NOTICE_DRAFT: NoticeDraft = {
  enabled: false,
  level: "info",
  title: "",
  body: "",
  url: "",
  extras: {},
};

/** The editor's working decomposition of a config payload. */
export interface ConfigDraft {
  urls: Record<UrlKey, string>;
  /** Boolean flag entries — editable via switches. */
  flags: Record<string, boolean>;
  /**
   * Flag entries whose value is NOT a boolean (corrupt per schema v1).
   * Shown loudly, preserved verbatim on save unless the admin removes them.
   */
  malformedFlags: Record<string, unknown>;
  notice: NoticeDraft;
  /** Every top-level key the editor does not know — round-trips unchanged. */
  extras: Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Decompose a raw config payload (jsonb from the DB) into the editor draft. */
export function configToDraft(config: unknown): ConfigDraft {
  const source = isPlainObject(config) ? config : {};

  const urls: Record<UrlKey, string> = {
    aidream_server_url: "",
    matrx_files_url: "",
    scraper_server_url: "",
  };
  for (const key of URL_KEYS) {
    const value = source[key];
    if (typeof value === "string") urls[key] = value;
  }

  const flags: Record<string, boolean> = {};
  const malformedFlags: Record<string, unknown> = {};
  if (isPlainObject(source.flags)) {
    for (const [key, value] of Object.entries(source.flags)) {
      if (typeof value === "boolean") flags[key] = value;
      else malformedFlags[key] = value;
    }
  }

  const notice: NoticeDraft = { ...EMPTY_NOTICE_DRAFT };
  if (isPlainObject(source.notice)) {
    const raw = source.notice;
    notice.enabled = true;
    const level = NOTICE_LEVELS.find((candidate) => candidate === raw.level);
    if (level) notice.level = level;
    if (typeof raw.title === "string") notice.title = raw.title;
    if (typeof raw.body === "string") notice.body = raw.body;
    if (typeof raw.url === "string") notice.url = raw.url;
    const noticeExtras: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!KNOWN_NOTICE_KEYS.has(key)) noticeExtras[key] = value;
    }
    notice.extras = noticeExtras;
  }

  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!KNOWN_CONFIG_KEYS.has(key)) extras[key] = value;
  }

  return { urls, flags, malformedFlags, notice, extras };
}

/**
 * Recompose the draft into the payload object that will be saved.
 * Extras first, known keys last — known fields always win on collision.
 */
export function draftToConfig(draft: ConfigDraft): Record<string, unknown> {
  const notice = draft.notice.enabled
    ? {
        ...draft.notice.extras,
        level: draft.notice.level,
        title: draft.notice.title,
        body: draft.notice.body,
        ...(draft.notice.url.trim().length > 0
          ? { url: draft.notice.url.trim() }
          : {}),
      }
    : null;

  return {
    ...draft.extras,
    aidream_server_url: draft.urls.aidream_server_url.trim(),
    matrx_files_url: draft.urls.matrx_files_url.trim(),
    scraper_server_url: draft.urls.scraper_server_url.trim(),
    flags: { ...draft.malformedFlags, ...draft.flags },
    notice,
  };
}

/**
 * Normalize a config payload to a canonical key order — known v1 keys in a
 * fixed order first (flags sorted), then unknown keys alphabetically — so
 * diffs show only real changes, never key-order churn.
 */
function normalizeConfigForDiff(config: unknown): unknown {
  if (!isPlainObject(config)) return config;
  const normalized: Record<string, unknown> = {};
  for (const key of URL_KEYS) {
    if (key in config) normalized[key] = config[key];
  }
  if ("flags" in config) {
    const flags = config.flags;
    normalized.flags = isPlainObject(flags)
      ? Object.fromEntries(
          Object.entries(flags).sort(([a], [b]) => a.localeCompare(b)),
        )
      : flags;
  }
  if ("notice" in config) normalized.notice = config.notice;
  const extraKeys = Object.keys(config)
    .filter((key) => !KNOWN_CONFIG_KEYS.has(key))
    .sort((a, b) => a.localeCompare(b));
  for (const key of extraKeys) normalized[key] = config[key];
  return normalized;
}

/**
 * Canonical pretty-JSON snapshot of the versioned fields of a config row —
 * the shape fed to DiffViewer everywhere (save confirm, history diffs) so
 * diffs are always apples-to-apples with stable key ordering.
 */
export function configSnapshotJson(snapshot: {
  schema_version: number;
  min_supported_app_version: string;
  config: unknown;
}): string {
  return JSON.stringify(
    {
      schema_version: snapshot.schema_version,
      min_supported_app_version: snapshot.min_supported_app_version,
      config: normalizeConfigForDiff(snapshot.config),
    },
    null,
    2,
  );
}

/** Flatten Zod issues into a `path → message` record for inline field errors. */
export function zodIssuesToFieldErrors(
  error: z.ZodError,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String).join(".") || "_root";
    if (!(path in result)) result[path] = issue.message;
  }
  return result;
}
