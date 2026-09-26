/**
 * features/capture-ladder/types.ts
 *
 * THE CAPTURE LADDER — the closed vocabulary, the trail shape, the handoff row
 * and the ladder law, as declared by the ONE cross-repo contract:
 * `common-docs/projects/acquisition-frontier/extension-ladder/CONTRACT.md` §1–§3.
 *
 * 🚨 The ORDER is not ours. `aidream/packages/matrx-scraper/matrx_scraper/ladder.py`
 * declares `RUNGS` once; every other repo imports the strings and never
 * re-declares the order. This file is this repo's import of those strings — if
 * it ever disagrees with that module, that module wins and this file is the bug.
 *
 * Nothing here talks to the network. The DB read lives in
 * `captureHandoffTable.ts`, the React state in `useNeedsYou.ts`.
 */

// ---------------------------------------------------------------------------
// §1 — the four rungs, in order
// ---------------------------------------------------------------------------

export const RUNGS = ["http", "browser", "own_browser", "human_drive"] as const;

export type Rung = (typeof RUNGS)[number];

/**
 * Entries a TRAIL may carry that the ladder ORDER does not reason about —
 * this repo's import of `matrx_scraper.ladder.OPTIONAL_RUNGS`.
 *
 * Residential egress is the person's own computer used as the internet exit
 * after our own address was blocked: the same `http`/`browser` work run again
 * from somewhere else, NOT a fifth rung. A trail may contain one at any
 * position; a trail without one is complete; nothing about which rung may
 * follow changes. Contract:
 * `common-docs/systems/platform/residential-egress/FEATURE.md`.
 *
 * 🚨 IT IS LISTED HERE BECAUSE OF WHAT HAPPENED WITHOUT IT. The ingress parse
 * in `captureHandoffTable.ts` validates every trail entry against this
 * vocabulary, so between the first residential capture and this constant
 * existing, EVERY row whose trail carried one — ten of them on the live
 * database — failed the parse and was dropped from the tray and from
 * `/capture/needs-you`. The pages were real and waiting; the web surface
 * simply did not list them. matrx-extend hit the identical defect on caption
 * hand-offs and fixed it in its own `src/lib/capture-ladder/types.ts`; this
 * file is that fix, carried across.
 */
export const OPTIONAL_RUNGS = ["residential"] as const;

export type OptionalRung = (typeof OPTIONAL_RUNGS)[number];

/** Anything a `rung_trail` entry may legally be: a rung, or an optional entry. */
export type TrailRung = Rung | OptionalRung;

export function isRung(value: unknown): value is Rung {
  return (
    typeof value === "string" && (RUNGS as readonly string[]).includes(value)
  );
}

export function asRung(value: unknown): Rung | null {
  return isRung(value) ? value : null;
}

export function isOptionalRung(value: unknown): value is OptionalRung {
  return (
    typeof value === "string" &&
    (OPTIONAL_RUNGS as readonly string[]).includes(value)
  );
}

/** A trail entry's key: one of the four rungs, or a legal optional entry. */
export function isTrailRung(value: unknown): value is TrailRung {
  return isRung(value) || isOptionalRung(value);
}

export function asTrailRung(value: unknown): TrailRung | null {
  return isTrailRung(value) ? value : null;
}

/** 0-based position on the ladder. `-1` for anything that is not a rung. */
export function rungIndex(rung: string): number {
  return (RUNGS as readonly string[]).indexOf(rung);
}

/**
 * The last ORDERED rung a trail actually reached, or `null`.
 *
 * THE ONE WAY to ask a trail "where did this get to" — mirrors
 * `matrx_scraper.ladder.last_ordered_rung`. The tail of the array is NOT that
 * question: an optional entry can sit last and is not a rung.
 */
export function lastOrderedRung(
  trail: readonly { rung: string }[] | null | undefined,
): Rung | null {
  if (!trail) return null;
  for (let i = trail.length - 1; i >= 0; i--) {
    const rung = asRung(trail[i]?.rung);
    if (rung) return rung;
  }
  return null;
}

/**
 * The rung in ONE plain sentence fragment a non-technical person reads. Never a
 * code on a screen — CONTRACT.md §1 names each rung in the person's words.
 */
export const RUNG_LABEL: Record<Rung, string> = {
  http: "Read straight off the web",
  browser: "Read by our own browser",
  own_browser: "Read by your browser",
  human_drive: "You drive the browser",
};

/** One more sentence of explanation, for the list where there is room. */
export const RUNG_EXPLANATION: Record<Rung, string> = {
  http: "A plain fetch of the page, the fastest way we have.",
  browser:
    "Our server browser opened the page for real, so anything the page draws with JavaScript is included.",
  own_browser:
    "Your own Chrome opens the page while you do nothing — it is already signed in, so it sees what you would see.",
  human_drive:
    "The extension shows you the page and gets out of the way. You sign in or click through, then press “I'm done, capture it”.",
};

/**
 * The optional entries in the person's words. Same law as the rungs: a screen
 * renders a sentence, never the key. A trail that shows `residential` as a
 * bare code is a machine word on a person's screen.
 */
export const OPTIONAL_RUNG_LABEL: Record<OptionalRung, string> = {
  residential: "Tried again from your own connection",
};

export const OPTIONAL_RUNG_EXPLANATION: Record<OptionalRung, string> = {
  residential:
    "The site refused our address, so we asked the same way again through your own internet connection. It is the same step, from somewhere else — not a further one.",
};

/** The label for any trail entry, rung or optional. Never a bare key. */
export function trailRungLabel(rung: string): string {
  if (isRung(rung)) return RUNG_LABEL[rung];
  if (isOptionalRung(rung)) return OPTIONAL_RUNG_LABEL[rung];
  return rung;
}

// ---------------------------------------------------------------------------
// THE LADDER LAW (§1) — never silently skip a rung
// ---------------------------------------------------------------------------

/** Thrown by {@link assertNoSkippedRung} — carries the offending pair in words. */
export class SkippedRungError extends Error {
  readonly from: string;
  readonly to: string;

  constructor(message: string, from: string, to: string) {
    super(message);
    this.name = "SkippedRungError";
    this.from = from;
    this.to = to;
  }
}

/**
 * THE LADDER LAW, re-asserted on the client.
 *
 * A capture may only move from rung *n* to rung *n+1*. It may STOP at any rung
 * — a stop is recorded with its reason and is visible — but it is NEVER a jump.
 * aidream asserts this when it writes a trail (`assert_no_skipped_rung`); we
 * assert it again on every trail we are handed, because a client that renders a
 * jump as if it were normal is how a silent skip survives.
 *
 * OPTIONAL ENTRIES ARE STEPPED OVER, exactly as `assert_no_skipped_rung` does
 * on the Python side. `residential` is the same work from a different address,
 * not a rung, so `http → residential → browser` is a LAWFUL trail and the one
 * the live database actually carries. Judging it against the four rungs — as
 * this function did before — turns a legal trail into a fabricated skipped-rung
 * accusation, which is the same lie as missing a real skip, pointed the other
 * way.
 *
 * @param trail the ordered trail keys, oldest first — `rung_trail.map(e => e.rung)`
 *              or any sequence of trail keys.
 * @throws {SkippedRungError} on a jump, a repeat, a backwards step, or a key
 *         that is neither a rung nor a legal optional entry.
 */
export function assertNoSkippedRung(trail: readonly string[]): void {
  // An unknown key is still a defect and is still named — but it is named
  // against the whole legal vocabulary, not against the four rungs alone.
  for (let i = 0; i < trail.length; i++) {
    if (isTrailRung(trail[i])) continue;
    throw new SkippedRungError(
      `“${trail[i]}” is not one of the four rungs (${RUNGS.join(
        ", ",
      )}) nor an optional trail entry (${OPTIONAL_RUNGS.join(", ")}).`,
      i === 0 ? "(start)" : trail[i - 1],
      trail[i],
    );
  }

  const ordered = trail.filter((key): key is Rung => isRung(key));
  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i];
    const at = rungIndex(current);
    if (i === 0) continue;
    const previous = ordered[i - 1];
    const before = rungIndex(previous);
    if (at !== before + 1) {
      throw new SkippedRungError(
        at <= before
          ? `The trail goes from “${previous}” back to “${current}” — a capture only ever moves forward.`
          : `The trail jumps from “${previous}” straight to “${current}”, skipping ${RUNGS.slice(
              before + 1,
              at,
            ).join(
              ", ",
            )}. A capture may stop at any rung, but it may never skip one.`,
        previous,
        current,
      );
    }
  }
}

/** Non-throwing form — the reason sentence, or `null` when the trail is lawful. */
export function skippedRungReason(trail: readonly string[]): string | null {
  try {
    assertNoSkippedRung(trail);
    return null;
  } catch (error) {
    return error instanceof SkippedRungError ? error.message : String(error);
  }
}

// ---------------------------------------------------------------------------
// §2 — the trail
// ---------------------------------------------------------------------------

/**
 * One entry per rung attempted. CONTRACT.md §2.
 *
 * `rung` is a {@link TrailRung}, not a {@link Rung}: a trail may legally carry
 * an optional entry, and typing this field as the narrower union is what let
 * every reader below quietly assume it could not.
 */
export interface RungTrailEntry {
  rung: TrailRung;
  ok: boolean;
  /** Machine class; `null` when ok. */
  reason: string | null;
  /** The plain sentence a person reads. */
  note: string | null;
  chars: number;
  /** ISO-8601. */
  at: string;
}

/**
 * Why a capture stopped instead of climbing. Mutually exclusive with
 * `next_rung`; one of the two is ALWAYS set on a failed result. A failed
 * result carrying neither is the silent-skip defect (§2).
 */
export const STOP_CAUSES = [
  "rung_disabled",
  "not_escalatable",
  "exhausted",
] as const;

export type StopCause = (typeof STOP_CAUSES)[number];

export function asStopCause(value: unknown): StopCause | null {
  return typeof value === "string" &&
    (STOP_CAUSES as readonly string[]).includes(value)
    ? (value as StopCause)
    : null;
}

/** The stop cause in the person's words — never the code on a screen. */
export const STOP_CAUSE_SENTENCE: Record<StopCause, string> = {
  rung_disabled: "The next step is switched off in your settings.",
  not_escalatable: "Nothing further we can do would beat this page.",
  exhausted: "We tried every step there is.",
};

/**
 * The escalation half of a failed capture result (§2). Present ALONGSIDE the
 * trail on a scrape result; every field is optional here because the server
 * half ships independently of this one — an absent field means "the server did
 * not say", and a surface renders nothing rather than inventing a value.
 */
export interface LadderOutcome {
  rung_trail?: RungTrailEntry[] | null;
  next_rung?: Rung | null;
  next_rung_reason?: string | null;
  next_rung_note?: string | null;
  /**
   * What the PERSON does, when the next rung needs them. On the server's
   * `ScrapeResult` (orchestrator.py) and absent from CONTRACT.md §2's field
   * list — reported to the contract's owner rather than dropped.
   */
  next_rung_what_to_do?: string | null;
  /** Honest estimate for the person. Same provenance as the field above. */
  next_rung_estimated_seconds?: number | null;
  stopped_because?: StopCause | null;
}

/** Reasons a person's own browser can beat — CONTRACT.md §2. */
export const OWN_BROWSER_BEATABLE_REASONS = [
  "login_wall",
  "bad_status",
  "cloudflare_block",
  "empty_content",
  "thin_content",
  "low_text_content",
  "wrong_resource",
  "paywall",
] as const;

export type OwnBrowserBeatableReason =
  (typeof OWN_BROWSER_BEATABLE_REASONS)[number];

// ---------------------------------------------------------------------------
// §3 — the handoff row (`media.capture_handoff`)
// ---------------------------------------------------------------------------

export const HANDOFF_STATUSES = [
  "waiting",
  "claimed",
  "capturing",
  "needs_drive",
  "captured",
  "failed",
  "dismissed",
] as const;

export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];

export function asHandoffStatus(value: unknown): HandoffStatus | null {
  return typeof value === "string" &&
    (HANDOFF_STATUSES as readonly string[]).includes(value)
    ? (value as HandoffStatus)
    : null;
}

/** The two rungs a handoff row can be waiting on (§3, `rung` column). */
export type HandoffRung = Extract<Rung, "own_browser" | "human_drive">;

// ---------------------------------------------------------------------------
// §3 — WHAT the person's browser is being asked to fetch
// ---------------------------------------------------------------------------

/**
 * The `handoff_kind` column's closed vocabulary — this repo's import of
 * matrx-extend's `HANDOFF_KINDS` (`src/lib/capture-ladder/types.ts`), which is
 * what the live CHECK constraint admits. Never re-spelled loosely: the
 * extension BRANCHES on these strings (`runner.ts` sends a `youtube_captions`
 * row down the caption reader instead of the page reader), so a variant here
 * would describe work the extension is not doing.
 *
 * 🚨 THIS EXISTS BECAUSE A QUEUE CALLED EVERYTHING A PAGE. The column shipped
 * with YouTube captions and this repo never learned it, so `/capture/needs-you`
 * and the assists chip told the person "3 pages are waiting for your browser"
 * when what waited was three videos. Zod let the rows through — nothing threw,
 * nothing was dropped, and the screen was simply wrong about the person's own
 * work, which is the quietest way for a surface to lie.
 */
export const HANDOFF_KINDS = ["web_page", "youtube_captions"] as const;

export type HandoffKind = (typeof HANDOFF_KINDS)[number];

/**
 * The kind, or `null`. A row whose kind we do not recognise is NOT coerced to
 * `web_page` here — a caller that must name the thing says "item" rather than
 * calling a future kind a page, which is the defect this vocabulary closes.
 */
export function asHandoffKind(value: unknown): HandoffKind | null {
  return typeof value === "string" &&
    (HANDOFF_KINDS as readonly string[]).includes(value)
    ? (value as HandoffKind)
    : null;
}

/**
 * What the person calls the thing. Never the column value.
 *
 * `youtube_captions` is a VIDEO to the person: the row's title is the video's
 * title, they queued a video, and what lands in their library is that video's
 * words. "Captions" is our side of it — true, and the explanation's job
 * ({@link HANDOFF_KIND_EXPLANATION}), not the noun's.
 */
export const HANDOFF_KIND_NOUN: Record<
  HandoffKind,
  { one: string; many: string }
> = {
  web_page: { one: "page", many: "pages" },
  youtube_captions: { one: "video", many: "videos" },
};

/** The noun for a mixed or unrecognised set — honest, never "page" by default. */
export const UNKNOWN_KIND_NOUN = { one: "item", many: "items" } as const;

/** One more sentence, for the surface that has room to say what we actually take. */
export const HANDOFF_KIND_EXPLANATION: Record<HandoffKind, string> = {
  web_page:
    "Your browser opens the page and keeps what it can read on it.",
  youtube_captions:
    "Your browser opens the video and keeps its subtitles — the words, not the video file.",
};

/** The noun for ONE row, in the person's words. */
export function handoffNoun(kind: HandoffKind | null): string {
  return kind ? HANDOFF_KIND_NOUN[kind].one : UNKNOWN_KIND_NOUN.one;
}

/**
 * A queue in the person's words: `"3 pages"`, `"one video"`,
 * `"2 pages and 3 videos"`.
 *
 * THE MIXED CASE IS THE POINT. One queue holds both kinds — the live table
 * carries pages waiting and videos captured in the same workspace — so every
 * count sentence is built here rather than hardcoding a noun at each call site,
 * which is how "pages" got into five sentences in the first place.
 *
 * `countWord` renders 1 as a word ("one page") for a sentence, or leave it off
 * for a digit ("1 page") where a heading wants the number to stand out.
 */
export function describeHandoffCounts(
  handoffs: readonly { handoff_kind?: HandoffKind | null }[],
  options: { countWord?: boolean } = {},
): string {
  const counts = new Map<HandoffKind | null, number>();
  for (const row of handoffs) {
    const kind = row.handoff_kind ?? null;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return describeKindCounts(counts, options);
}

/** The same sentence from counts alone, for a surface that has no rows to hand. */
export function describeKindCounts(
  counts: ReadonlyMap<HandoffKind | null, number>,
  options: { countWord?: boolean } = {},
): string {
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  if (total === 0) return `no ${UNKNOWN_KIND_NOUN.many}`;

  const say = (n: number, kind: HandoffKind | null): string => {
    const noun = kind ? HANDOFF_KIND_NOUN[kind] : UNKNOWN_KIND_NOUN;
    const number = n === 1 && options.countWord ? "one" : String(n);
    return `${number} ${n === 1 ? noun.one : noun.many}`;
  };

  // Stable order, so the same queue never reads two ways: the declared
  // vocabulary first, anything unrecognised last.
  const ordered: (HandoffKind | null)[] = [...HANDOFF_KINDS, null];
  const parts = ordered
    .filter((kind) => (counts.get(kind) ?? 0) > 0)
    .map((kind) => say(counts.get(kind) ?? 0, kind));

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The statuses that mean a person still has something in front of them. The
 * tray and `/capture/needs-you` read exactly these two (§8.1).
 */
export const NEEDS_YOU_STATUSES: readonly HandoffStatus[] = [
  "waiting",
  "needs_drive",
];

/**
 * One row of `media.capture_handoff` as this app reads it.
 *
 * ⚠️ VERIFIED AGAINST THE LIVE TABLE, 2026-09-17. The table EXISTS on the live
 * database; this interface was checked column-for-column against
 * `information_schema.columns` for `media.capture_handoff` — not against the
 * contract's prose, which omits `final_url` and the entity-table base columns
 * (`version`, `metadata`, `created_by`, `updated_by`, `deleted_at`) that
 * `platform.create_entity_table` adds to every row. Nullability below is the
 * DATABASE's nullability, not a guess: `title`, `reason`, `reason_note`,
 * `what_to_do`, `rung_trail`, `attempt_count`, `created_at`, `updated_at`,
 * `version` and `metadata` are all NOT NULL there, so they are not `| null`
 * here, and no screen needs an "if it is missing" branch for them.
 *
 * 🚨 This is a HAND-WRITTEN row type, which this repo normally forbids
 * (generated types are the source of truth). It is hand-written for ONE reason,
 * re-verified 2026-09-17: `media` is not in the `pnpm db-types` schema list
 * (package.json line 64), so the generated `Database` type has no `media` key
 * and `.schema("media")` cannot type-check on the generated client. The moment
 * `media` joins that list, this interface is DELETED and every reader aliases
 * `Database["media"]["Tables"]["capture_handoff"]["Row"]`.
 */
export interface CaptureHandoff {
  id: string;
  organization_id: string;
  url: string;
  /** Best-known title; `""` when unknown (NOT NULL, default `''`). */
  title: string;
  rung: HandoffRung;
  status: HandoffStatus;
  /**
   * WHAT the browser is being asked to fetch. NOT NULL, defaults to
   * `'web_page'`; the live CHECK admits {@link HANDOFF_KINDS}. Added to the
   * table after this interface was first written, which is exactly why every
   * screen called a video a page until 2026-09-20.
   *
   * `null` means THIS BUILD does not recognise the server's value — never
   * "absent". The ingress parse keeps such a row and every sentence calls it an
   * "item"; see the note on the `handoff_kind` field in `captureHandoffTable.ts`.
   */
  handoff_kind: HandoffKind | null;
  /** Machine class that sent it here. NOT NULL — the server always names one. */
  reason: string;
  /** ONE plain sentence: why your browser. NOT NULL. */
  reason_note: string;
  /** ONE plain sentence: what the person does. `""` for `own_browser`. NOT NULL. */
  what_to_do: string;
  /** Honest estimate for the person; `null` when unknown. */
  estimated_seconds: number | null;
  /** NOT NULL, defaults to `[]` — never absent, at worst empty. */
  rung_trail: RungTrailEntry[];
  batch_id: string | null;
  library_id: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  attempt_count: number;
  /**
   * The Source this handoff was captured as (SOURCE-CONVERGENCE §2.4, §4.3):
   * the capture ladder lands through the door, so a captured row names its
   * `docproc.processed_documents` row. Replaces the retired
   * `captured_item_id` (a `media.library_item` pointer, no longer written).
   */
  captured_processed_document_id: string | null;
  captured_chars: number | null;
  captured_at: string | null;
  /**
   * Which rung actually captured it. The live CHECK constraint admits only
   * `own_browser` and `human_drive` — a server rung never captures a handoff,
   * because a handoff only exists once the server rungs are done.
   */
  captured_by_rung: HandoffRung | null;
  /**
   * Where the capture actually ended up after redirects. On the live table and
   * absent from CONTRACT.md §3 — reported to the contract's owner.
   */
  final_url: string | null;
  failure_note: string | null;

  // ── The entity-table base columns (`platform.create_entity_table`) ────────
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  /** Soft delete is ON for this table; every read filters `deleted_at IS NULL`. */
  deleted_at: string | null;
  version: number;
  metadata: Record<string, unknown>;
  /**
   * The entity-table's per-row extras. NOT NULL, defaults to `{}` — same
   * contract as `metadata`, so no screen branches on it being absent.
   */
  custom_fields: Record<string, unknown>;
}

/**
 * How long this will take, in the person's words. `null` when the server did
 * not say — a surface then shows nothing, never a made-up number.
 */
export function describeEstimate(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 90) return `about ${Math.round(seconds)} seconds`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "about a minute" : `about ${minutes} minutes`;
}

/**
 * The ONE sentence that tells a `needs_drive` row apart from a `waiting` one —
 * the difference between "your browser will do this by itself" and "you have to
 * click through this one". Contract §3/§7.4.
 */
export function describeWhoActs(handoff: CaptureHandoff): string {
  const noun = handoffNoun(handoff.handoff_kind ?? null);
  return handoff.status === "needs_drive" || handoff.rung === "human_drive"
    ? `You need to open this ${noun} yourself`
    : `Your browser will do this on its own`;
}
