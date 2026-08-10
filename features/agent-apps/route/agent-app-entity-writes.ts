"use client";

/**
 * agent-app-entity-writes — the two ENTITY write targets of
 * `matrx-user/agent-apps` (`app_category`, `app_tags`), shared by the two
 * mounts that can service them.
 *
 * The surface's other three targets (`app_name` / `app_tagline` /
 * `app_description`) are `mode: "draft"`: they stage into the Settings tab's
 * own inputs, so they only exist where those inputs are mounted and they live
 * in `AgentAppSettingsContent`. These two persist immediately and need no
 * editor — only the open row — so they are ALSO registered on the
 * `/agent-apps/[id]` layout (`AgentAppSurfaceRuntime`), which means an agent
 * can set a category or retag an app from overview / run / code / versions
 * instead of only from Settings.
 *
 * Both registrations share this ONE validator set so the contract an agent is
 * told about cannot drift between the two mounts. The validators THROW rather
 * than coercing — the writeback seam turns a throw into the error envelope the
 * agent reads, and a wrong value is the agent's to hear about.
 */

/** `null` clears the column; a blank string is not a category. */
export function validateAppCategory(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(
      `app_category must be a string; got ${value === undefined ? "undefined" : typeof value}.`,
    );
  }
  if (!value.trim()) {
    throw new Error(
      "app_category must be a non-empty string, or null to clear the category — an empty string is not a category.",
    );
  }
  return value.trim();
}

/** Replaces the FULL tag set. Duplicates are rejected, not silently dropped. */
export function validateAppTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      "app_tags must be an array of strings — it replaces the full tag set.",
    );
  }
  const next = value.map((tag, i) => {
    if (typeof tag !== "string" || !tag.trim()) {
      throw new Error(
        `app_tags[${i}] must be a non-empty string; got ${JSON.stringify(tag)}.`,
      );
    }
    return tag.trim();
  });
  const seen = new Set<string>();
  for (const tag of next) {
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      throw new Error(
        `app_tags contains the duplicate tag "${tag}" — send each tag once.`,
      );
    }
    seen.add(key);
  }
  return next;
}

export interface AgentAppEntityWriteOptions {
  /**
   * The open app, read at CALL time. Staging into a row that has not hydrated
   * would write to nothing, so the handlers refuse instead.
   */
  getApp: () => { id: string } | undefined;
  /**
   * The canonical persist path — `saveAppField`, however the mount reaches it.
   * MUST reject on failure: a persist that swallows its own error would make
   * the seam report success on a save that never happened.
   */
  persist: (
    appId: string,
    field: "category" | "tags",
    value: string | string[] | null,
  ) => Promise<void>;
}

export function buildAgentAppEntityWriteHandlers({
  getApp,
  persist,
}: AgentAppEntityWriteOptions): Record<
  string,
  (value: unknown) => Promise<void>
> {
  const requireOpenApp = (target: string) => {
    const app = getApp();
    if (!app) {
      throw new Error(
        `Cannot apply ${target}: no agent app is open yet on this page. Wait for the app to load, or open an app at /agent-apps/[id] first.`,
      );
    }
    return app;
  };

  return {
    app_category: async (value) => {
      const app = requireOpenApp("app_category");
      await persist(app.id, "category", validateAppCategory(value));
    },
    app_tags: async (value) => {
      const app = requireOpenApp("app_tags");
      await persist(app.id, "tags", validateAppTags(value));
    },
  };
}
