"use client";

// lib/reversible/announceReversible.tsx — THE REVERSIBLE ACTION, drawn.
//
// The platform rule (Arman, 2026-10-02): a reversible action ACTS AT ONCE, offers Undo long enough
// to feel safe, and TEACHES the person progressively — the first time massively emphasized with
// where the thing went and how to get it back, the next few lighter, then an ordinary Undo toast.
// Champions: Gmail's Undo (visible, long, keyboard), Notion and Linear (act at once; ⌘Z undoes the
// last action; Trash one click away), Superhuman's first-use teaching that fades. Beyond them: the
// teaching names and OPENS the exact place the thing went, and flashes it there.
//
// ONE CALL, made AFTER the action succeeded:
//
//   announceReversible({
//     verb: "archive", noun: "table", subject: "Patient Visit Tracker",
//     undo: () => restore(tableId),                       // throw an Error with the plain reason
//     foundAt: { label: "Archived tables", href: "/data", highlight: "archived-tables" },
//   });
//
// The policy (tiers, counting, windows, the ⌘Z rule) is `@ai-matrx/kit/reversible`; the person's
// counts are their synced preferences (`reversibleCounts.ts`); the windows are the knobs
// `platform/undo_window_seconds` and `platform/undo_window_guide_seconds` (organization + user).
// A package that cannot import this file hands the same announcement to its host through a port
// (records-ui `notify.reversible`). Never hand-write `{ action: { label: "Undo" } }` on a toast —
// `pnpm check:undo-toasts` fails on a new one.

import {
  isReversibleUndoShortcut,
  reversibleDurationMs,
  reversiblePastTense,
  foundAtHref,
  type ReversibleAnnouncement,
  type ReversibleTier,
} from "@ai-matrx/kit/reversible";
import { customToastOnWallClock, toast } from "@/lib/toast";
import { getSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { ReversibleNotice } from "./ReversibleNotice";
import { countThisPersonsAction, tierForThisPerson } from "./reversibleCounts";

type ToastId = string | number;

/** What a person sees named: "“Patient Visit Tracker”", "3 notes", "the table". */
export function reversibleWhat(a: Pick<ReversibleAnnouncement, "noun" | "subject" | "count">): string {
  if (typeof a.count === "number" && a.count > 1) return `${a.count.toLocaleString()} ${a.noun}s`;
  const subject = a.subject?.trim();
  return subject ? `“${subject}”` : `the ${a.noun}`;
}

/** "⌘Z" on Apple keyboards, "Ctrl+Z" everywhere else. */
function undoShortcutLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl+Z";
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "⌘Z" : "Ctrl+Z";
}

/**
 * The window a knob answers, or — only until the session's settings snapshot has landed — the
 * value the knob is seeded with (`reversible_a_an_archive_acts_at_once_and_offers_undo.sql`).
 */
function windowSeconds(key: "undo_window_seconds" | "undo_window_guide_seconds", seeded: number): number {
  const value = getSessionKnob({ feature: "platform", key });
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && value !== undefined && value !== null && value !== "" ? n : seeded;
}

// ---------------------------------------------------------------------------
// The announcements on screen, newest last — what ⌘Z undoes.
// ---------------------------------------------------------------------------

interface Live {
  toastId: ToastId;
  undo: () => void;
}

const live: Live[] = [];

function forget(toastId: ToastId): void {
  const at = live.findIndex((l) => l.toastId === toastId);
  if (at >= 0) live.splice(at, 1);
}

/**
 * An announcement sonner no longer shows is not one ⌘Z may reach. Sonner tells us through
 * `onDismiss` in the ordinary case; this re-checks its own list so a dismissal that skipped the
 * callback (a hidden tab, a hot reload) can never leave an invisible Undo armed.
 */
function dropWhatLeftTheScreen(): void {
  const getToasts = (toast as unknown as { getToasts?: () => Array<{ id: ToastId; delete?: boolean }> }).getToasts;
  if (typeof getToasts !== "function") return;
  const shown = new Set(getToasts().filter((t) => !t.delete).map((t) => t.id));
  for (const entry of [...live]) if (!shown.has(entry.toastId)) forget(entry.toastId);
}

let shortcutInstalled = false;

/**
 * ⌘Z / Ctrl+Z undoes the most recent announcement still on screen — never inside a field the person
 * is typing in, never a key a surface's own undo already handled (`isReversibleUndoShortcut`).
 * Listening in the bubble phase on window is what lets a board or an editor claim the key first.
 */
function installUndoShortcut(): void {
  if (shortcutInstalled || typeof window === "undefined") return;
  shortcutInstalled = true;
  window.addEventListener("keydown", (event) => {
    dropWhatLeftTheScreen();
    const newest = live[live.length - 1];
    if (!newest || !isReversibleUndoShortcut(event)) return;
    event.preventDefault();
    newest.undo();
  });
}

/** Test seam: the announcements ⌘Z can reach, newest last. */
export function liveReversibleCount(): number {
  return live.length;
}

// ---------------------------------------------------------------------------
// THE CALL
// ---------------------------------------------------------------------------

export interface AnnouncedReversible {
  tier: ReversibleTier;
  toastId: ToastId;
}

export function announceReversible(announcement: ReversibleAnnouncement): AnnouncedReversible {
  installUndoShortcut();
  const { verb, noun, foundAt } = announcement;
  // The tier comes from the person's history BEFORE this action; then this action is counted.
  const tier = tierForThisPerson(verb, noun);
  countThisPersonsAction(verb, noun);

  const what = reversibleWhat(announcement);
  const title = `${reversiblePastTense(verb)} ${what}`;
  const duration = reversibleDurationMs(tier, {
    plainSeconds: windowSeconds("undo_window_seconds", 8),
    guideSeconds: windowSeconds("undo_window_guide_seconds", 12),
  });

  let toastId: ToastId = "";
  let settled = false;

  const close = () => {
    forget(toastId);
    toast.dismiss(toastId);
  };

  const undo = () => {
    if (settled) return;
    settled = true;
    close();
    void (async () => {
      try {
        await announcement.undo();
        toast.success(`Restored ${what}`);
      } catch (error) {
        // NOTHING FAILS SILENTLY, AND THE THING STAYS FINDABLE: the reason in a plain sentence and,
        // when the caller said where it went, the way there.
        const reason = error instanceof Error && error.message ? error.message : "It could not be brought back.";
        toast.error(`Couldn’t restore ${what}`, {
          description: reason,
          ...(foundAt
            ? {
                action: {
                  label: `Open ${foundAt.label}`,
                  onClick: () => window.location.assign(foundAtHref(foundAt)),
                },
              }
            : {}),
        });
      }
    })();
  };

  toastId = customToastOnWallClock(
    () => (
      <ReversibleNotice
        tier={tier}
        title={title}
        foundAt={foundAt}
        shortcut={undoShortcutLabel()}
        onUndo={undo}
        onDismiss={close}
      />
    ),
    {
      duration,
      onDismiss: () => forget(toastId),
      onAutoClose: () => forget(toastId),
    },
  );
  live.push({ toastId, undo });
  return { tier, toastId };
}
