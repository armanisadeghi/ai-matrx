/**
 * Two kinds of connection, and the difference has to be visible at a glance.
 *
 * Arman, 2026-09-15: "You are not differentiating between things that are just
 * purely a connection to an MCP and those that allow us to select something.
 * Google Drive or Sheets: I select it and, while we give the agent the MCP,
 * also let a user choose what they want to attach directly."
 *
 * Until today every connection in the composer rail and the Tools picker wore
 * the same chip: a name and a state. That is the whole truth for a pure MCP
 * server — there is nothing to pick, the agent simply gets the tools. It is
 * only half the truth for GitHub or Google, where the useful act is not
 * "connect" but "choose WHICH repositories" / "choose WHICH files", and a chip
 * that stops at Connected leaves the person staring at a service that reaches
 * everything and nothing.
 *
 * The champions: Claude.ai's Google Drive picker (connect, then pick the exact
 * documents, which then ride the conversation) and Cursor's repository
 * selection (the repo is chosen once and stays chosen).
 *
 * This module is the ONE decision that separates the two kinds, kept pure so a
 * test can prove a chip renders the right way from the payload alone.
 *
 * 🚨 NO PROVIDER LIST LIVES HERE. Which servers are attachable, what they call
 * their resources, and whether candidates come from a synced inventory or a
 * live provider search are all answered by the server's own availability
 * payload (`attachable`). A `if (slug === "github")` in this file would put the
 * product's vocabulary in the client, where a new provider means a deploy.
 */

import type { McpAvailability } from "./connection-state";

/**
 * Where a provider's candidate resources come from.
 *
 * - `inventory` — we already hold them (the synced GitHub repository list);
 *   search is instant and local, and an empty list means a real access gap
 *   the user can close, never "still loading".
 * - `live` — only the provider can answer (Drive is far too large to sync);
 *   search is a debounced round-trip that must SAY it is searching.
 */
export type AttachableResourceSource = "inventory" | "live";

/** One kind of thing a connection lets a person attach to a conversation. */
export interface AttachableResource {
  /** Canonical resource type, e.g. `github_repository`, `google_sheet`. */
  resource_type: string;
  source: AttachableResourceSource;
  /**
   * The provider's own plural word for these things — "repositories",
   * "files", "sheets". The server owns this vocabulary; the client renders it
   * verbatim so a new provider needs no frontend change.
   */
  label: string;
}

/**
 * The availability row as the server sends it once attachable resources are
 * part of the contract. `attachable` is optional and absent-means-empty, so a
 * server that has not shipped it yet degrades to today's plain chips rather
 * than to a broken screen.
 *
 * The generated contract NOW carries `attachable` (`AttachableKindInfo`), and it
 * types `source` as a bare `string` because the server's enum does not survive
 * OpenAPI. This type is therefore the generated row with that ONE field narrowed
 * to the two sources the client actually branches on — an `interface … extends`
 * could not narrow it and failed `tsc` with TS2430 the day the property landed.
 * Everything else comes from the generated type, which stays the source of truth.
 */
export type AttachableAvailability = Omit<McpAvailability, "attachable"> & {
  // Absent means empty, and it is never `null` here: an availability row that
  // was allowed to be null could not be handed back to anything expecting the
  // generated shape (TS2322 in `useMcpTools`), and every reader below already
  // takes `null | undefined` for the value itself.
  attachable?: AttachableResource[];
};

/**
 * What a chip IS. `plain` means the connection is the whole story; every
 * control on it is about the connection itself. `attachable` means the
 * connection is a door to a chooser, and the chip owes the person that door
 * plus a count of what they have already chosen.
 */
export type ChatConnectionKind = "plain" | "attachable";

/** Only a real, non-empty offer makes a connection attachable. */
export function chatConnectionKind(
  attachable: readonly AttachableResource[] | null | undefined,
): ChatConnectionKind {
  return normalizeAttachable(attachable).length > 0 ? "attachable" : "plain";
}

/**
 * Drop malformed entries rather than render a chooser that cannot name what
 * it chooses. A resource type with no usable label is not a silent pass: it
 * would produce a button reading "Choose …", which is exactly the kind of
 * control that looks broken and teaches people not to click.
 */
export function normalizeAttachable(
  attachable: readonly AttachableResource[] | null | undefined,
): AttachableResource[] {
  if (!Array.isArray(attachable)) return [];
  return attachable.filter(
    (entry): entry is AttachableResource =>
      Boolean(entry) &&
      typeof entry.resource_type === "string" &&
      entry.resource_type.length > 0 &&
      typeof entry.label === "string" &&
      entry.label.trim().length > 0 &&
      (entry.source === "inventory" || entry.source === "live"),
  );
}

/**
 * The action written on an attachable chip, in the provider's own words:
 * "Choose repositories…", "Choose files or sheets…".
 *
 * Returns `null` for a plain connection so a caller cannot accidentally paint
 * a chooser on a server that has nothing to choose.
 */
export function attachActionLabel(
  attachable: readonly AttachableResource[] | null | undefined,
): string | null {
  const entries = normalizeAttachable(attachable);
  if (entries.length === 0) return null;
  const words: string[] = [];
  for (const entry of entries) {
    const word = entry.label.trim();
    if (!words.includes(word)) words.push(word);
  }
  return `Choose ${joinWithOr(words)}…`;
}

function joinWithOr(words: string[]): string {
  if (words.length === 1) return words[0];
  if (words.length === 2) return `${words[0]} or ${words[1]}`;
  return `${words.slice(0, -1).join(", ")}, or ${words[words.length - 1]}`;
}

/** True when any of this connection's resources need a live provider search. */
export function needsLiveSearch(
  attachable: readonly AttachableResource[] | null | undefined,
): boolean {
  return normalizeAttachable(attachable).some(
    (entry) => entry.source === "live",
  );
}

// ── What is actually attached ──────────────────────────────────────────────

/**
 * One resource attached to a conversation, as
 * `GET /conversations/{id}/attachments` returns it. The row is an edge in
 * `platform.associations` — the server writes it through the registered
 * association path, which is why the client never sees a junction table.
 */
export interface ConversationAttachment {
  association_id: string;
  provider: string;
  resource_type: string;
  display_name: string;
  /** The resource's own home — a repo page, a Drive file. THE DOOR LAW. */
  link: string | null;
  /** The provider's stable reference for the thing (`owner/repo`, a file id). */
  resource_ref: string;
  metadata: Record<string, unknown> | null;
}

/**
 * A pick made before the conversation exists on the server.
 *
 * On `/chat/new` the composer renders against a minted conversation id while
 * the row behind it has not been created yet, so `POST` would 404. The pick is
 * held here, keyed to that same id, and flushed the moment the conversation is
 * real — the identical class as the per-run additions that used to vanish on
 * the new-chat handoff (6843361ca1, 2026-09-14). A pick is never "applied
 * later, silently": until it lands it renders as its own pending chip.
 */
export interface PendingAttachment {
  provider: string;
  resource_type: string;
  display_name: string;
  link: string | null;
  resource_ref: string;
  metadata: Record<string, unknown> | null;
}

/** A row on screen: either landed on the server, or still on its way. */
export type DisplayedAttachment =
  | ({ pending: false } & ConversationAttachment)
  | ({ pending: true } & PendingAttachment);

/**
 * What the user should SEE: every landed row, plus every pick that has not
 * landed yet, with no double-rendering of a pick whose flush already
 * succeeded.
 *
 * Identity is `provider` + `resource_ref`, never the display name — two Drive
 * files are routinely called "Untitled spreadsheet", and de-duplicating on the
 * name would make one of them disappear.
 */
export function mergeAttachments(
  rows: readonly ConversationAttachment[],
  pending: readonly PendingAttachment[],
): DisplayedAttachment[] {
  const landed = new Set(rows.map((row) => attachmentKey(row)));
  return [
    ...rows.map((row) => ({ pending: false as const, ...row })),
    ...pending
      .filter((pick) => !landed.has(attachmentKey(pick)))
      .map((pick) => ({ pending: true as const, ...pick })),
  ];
}

/** The stable identity of an attachment within one conversation. */
export function attachmentKey(
  item: Pick<PendingAttachment, "provider" | "resource_ref">,
): string {
  return `${item.provider}\0${item.resource_ref}`;
}

/** How many things are attached for each provider — the chip's count. */
export function attachmentCountsByProvider(
  items: readonly DisplayedAttachment[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.provider] = (counts[item.provider] ?? 0) + 1;
  }
  return counts;
}

/** Just this provider's items, in the order they were merged. */
export function attachmentsForProvider(
  items: readonly DisplayedAttachment[],
  provider: string,
): DisplayedAttachment[] {
  return items.filter((item) => item.provider === provider);
}
