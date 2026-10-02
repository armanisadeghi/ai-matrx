/**
 * Named, remedied host errors and the announce-once helper (Law 4: nothing
 * fails silently — a default that cannot do its job says so, once, with the fix).
 */

export class ChatHostNotConfiguredError extends Error {
  readonly code = "chat-host-not-configured";
  constructor() {
    super(
      "The chat package was used before a host was configured. " +
        "Wrap the app in <ChatProvider host={{ db }}> (or call configureChat({ db }) " +
        "before any chat code runs), passing an authenticated Supabase client as `db`.",
    );
    this.name = "ChatHostNotConfiguredError";
  }
}

export class ChatHostInvalidError extends Error {
  readonly code = "chat-host-invalid";
  constructor(detail: string) {
    super(
      `The chat host is invalid: ${detail}. ` +
        "Pass an authenticated Supabase client as `db` — it is the only required value.",
    );
    this.name = "ChatHostInvalidError";
  }
}

export class ChatOrganizationRequiredError extends Error {
  readonly code = "chat-organization-required";
  constructor(reason: string) {
    super(
      `An organization is required (${reason}), and this host has no organization picker. ` +
        "Pass an `org` port to the chat host whose require() asks the person.",
    );
    this.name = "ChatOrganizationRequiredError";
  }
}

const announced = new Set<string>();

/** Logs `message` to the console the first time `key` is seen in this page. */
export function announceOnce(
  key: string,
  message: string,
  level: "warn" | "error" | "info" = "warn",
): boolean {
  if (announced.has(key)) return false;
  announced.add(key);
  const line = `[ai-matrx/chat] ${message}`;
  if (level === "error") console.error(line);
  else if (level === "info") console.info(line);
  else console.warn(line);
  return true;
}

/** Test-only: forget every announcement. */
export function _resetAnnouncements(): void {
  announced.clear();
}
