// features/masterwork/sitting/textEntrySurfaces.ts
//
// EVERY PLACE UNDER MASTERWORK WHERE A PERSON TYPES DECLARES WHAT HAPPENS TO
// WHAT THEY TYPED.
//
// ## Why this exists beside `lanePersistence.ts`
//
// `./lanePersistence.ts` closed the same class one level up: every CAPTURE
// LANE the Approach registry promises must declare what a reload does to
// in-progress work, and its guard reads the live registry so a new lane cannot
// ship without answering. That worked — and then cold walk 8 (2026-09-17)
// found the identical loss on the "New document" resource, and the registry
// had nothing to say about it, because the registry only knows about LANES.
//
// Three ways a surface escapes a lane registry, all of them live here today:
//
//   1. It is not a lane. `AuditionDialog`, `CompareTwoDialog`, `RunTheBench`
//      and `BuildWindow` are dialogs and pages an Expert pastes real work
//      into, and not one of them resolves to an `ApproachLane`.
//   2. It is a DOOR OUT. The Rulebook's Resources panel offers "New document",
//      which creates a platform document and opens `/documents/<id>` — a
//      surface in another feature entirely, which the masterwork registry
//      could never have enumerated. That is the door walk 8 went through.
//   3. It is a field on a page that is mostly about something else, like the
//      rule editor's own fields.
//
// So the question this file forces is not "is this lane declared?" but "is
// there ANY way to type under masterwork that nobody has answered for?" — and
// its guard answers that by reading the files themselves rather than a
// registry, because a file is the one thing a new surface cannot ship without.
//
// ## What counts as an answer
//
// The four answers from `./lanePersistence.ts` (`sitting`, `server-run`,
// `server-write`, `none`) mean exactly what they mean there, and the guard
// checks the named module really carries the mechanism. This file adds one
// more, because a door is a real shape and pretending it is a lane is how the
// question got skipped:
//
//   door — this surface holds no typed work of its own; it OPENS another
//          module, and that module does the keeping. It must name it, and the
//          named module is checked too. A door that opens something which
//          keeps nothing is not a door, it is the bug with a nicer name.
//
// A `why` is required on everything except `sitting`, for the same reason as
// next door: the other answers are claims about a surface's shape that the
// next person has to be able to check.

import type { LanePersistence } from "./lanePersistence";

/** A surface that types nothing itself and hands the work to another module. */
export type DoorOut = {
  kind: "door";
  /** Repo-relative module of the door itself. */
  module: string;
  /** Repo-relative module that receives the work and must keep it. */
  opens: string;
  /** Tokens that must appear in `opens` for its keeping to be real. */
  keptBy: string[];
  why: string;
};

export type SurfaceKeeping = LanePersistence | DoorOut;

/**
 * Keyed by the repo-relative path of the file that renders the text entry.
 * The guard walks `features/masterwork/**` itself, so a new file with a
 * `<Textarea>` in it fails here by name until somebody answers for it.
 */
export const TEXT_ENTRY_SURFACES: Record<string, SurfaceKeeping> = {
  // ── doors out of masterwork ────────────────────────────────────────────
  "features/masterwork/components/detail/RulebookSourcesPanel.tsx": {
    kind: "door",
    module: "features/masterwork/components/detail/RulebookSourcesPanel.tsx",
    opens: "features/data-tables/components/DocumentEditor.tsx",
    // The editor autosaves on a 2.5s debounce, flushes that debounce the
    // moment the page is hidden or unmounted, warns before an unload that
    // would outrun it, and says so out loud when it cannot save at all.
    // Whole registration calls, not bare words: a substring like
    // "beforeunload" also matches the comment explaining it, so the first
    // version of this row went green over a listener that had been deleted.
    keptBy: [
      'addEventListener("pagehide"',
      'addEventListener("beforeunload"',
      "announceUnsaveable(",
    ],
    why:
      'The panel itself types only a document NAME before handing off. Its ' +
      '"New document" action creates a platform document and opens ' +
      "/documents/<id>, so every paragraph the Expert writes belongs to the " +
      "document editor. Walk 8 went through this door and lost everything " +
      "typed on the other side of it, which is why the door is declared here " +
      "and the module it opens is checked.",
  },

  // ── lanes: the answer lives in ./lanePersistence.ts, repeated here so the
  //    file-level guard can see it. The lane guard checks the mechanism; this
  //    one only checks that the question was answered for the FILE.
  "features/masterwork/components/detail/BodyOfWorkDialog.tsx": {
    kind: "sitting",
    module: "features/masterwork/components/detail/BodyOfWorkDialog.tsx",
    keeps: "the links listed so far and what they were called",
  },
  "features/masterwork/components/detail/ChatImportDialog.tsx": {
    kind: "sitting",
    module: "features/masterwork/components/detail/ChatImportDialog.tsx",
    keeps: "the pasted chat, what it was called, and the topic",
  },
  "features/masterwork/components/detail/IngestSourceDialog.tsx": {
    kind: "sitting",
    module: "features/masterwork/components/detail/IngestSourceDialog.tsx",
    keeps: "the pasted material and what the Expert called it",
  },
  "features/masterwork/components/detail/IngestTimelineDialog.tsx": {
    kind: "sitting",
    module: "features/masterwork/components/detail/IngestTimelineDialog.tsx",
    keeps: "the case as typed, with its title and its provenance fields",
  },
  "features/masterwork/components/detail/MeetingScavengerDialog.tsx": {
    kind: "sitting",
    module: "features/masterwork/components/detail/MeetingScavengerDialog.tsx",
    keeps: "the pasted meeting and what it was called",
  },
  "features/masterwork/components/detail/RedPenDialog.tsx": {
    kind: "sitting",
    module: "features/masterwork/components/detail/RedPenDialog.tsx",
    keeps:
      "the work being marked up, what it was called, and every correction saved against it",
  },
  "features/masterwork/components/detail/ShadowInboxDialog.tsx": {
    kind: "sitting",
    module: "features/masterwork/components/detail/ShadowInboxDialog.tsx",
    keeps: "the thread pasted in and what it was called",
  },
  "features/masterwork/prediction/PredictionLedgerDialog.tsx": {
    kind: "sitting",
    module: "features/masterwork/prediction/PredictionLedgerDialog.tsx",
    keeps: "the call being written — the case, the prediction, the reason and the date",
  },
  "features/masterwork/sorting/SortingTablePage.tsx": {
    kind: "sitting",
    module: "features/masterwork/sorting/SortingTablePage.tsx",
    keeps: "the pile dealt, which case she is on, and every case already sorted",
  },
  "features/masterwork/capture-plan/CapturePlanPage.tsx": {
    kind: "sitting",
    module: "features/masterwork/capture-plan/CapturePlanPage.tsx",
    keeps:
      "the plan being set up before it is built — what the Expert wants covered and the minutes they have",
  },

  // ── surfaces the lane registry never covered, found by walk 8's census ──
  "features/masterwork/components/masterworks/AuditionDialog.tsx": {
    kind: "sitting",
    module: "features/masterwork/components/masterworks/AuditionDialog.tsx",
    keeps:
      "the pasted Masterwork output, the real thing it is judged against, what the case was called, and the input both were given",
  },
  "features/masterwork/components/masterworks/CompareTwoDialog.tsx": {
    kind: "sitting",
    module: "features/masterwork/components/masterworks/CompareTwoDialog.tsx",
    keeps: "both pasted answers and what each of them was called",
  },
  "features/masterwork/encore/RunTheBench.tsx": {
    kind: "sitting",
    module: "features/masterwork/encore/RunTheBench.tsx",
    keeps:
      "the job every arm is asked to do, the material it is about, and what the expert actually said — the three fields a bench run is built from, and the ones it would be most expensive to retype before paying for a run",
  },
  "features/masterwork/build/BuildWindow.tsx": {
    kind: "sitting",
    module: "features/masterwork/build/BuildWindow.tsx",
    keeps: "what the Masterwork is to be called and the instructions it is built from",
  },
  "features/masterwork/components/detail/RuleFields.tsx": {
    kind: "server-write",
    module: "features/masterwork/components/detail/RuleEditorDialog.tsx",
    why:
      "RuleFields is a controlled field set with no state of its own — every " +
      "value is owned by the editor dialog that renders it, which writes an " +
      "approved rule to the server on save. The keeping question belongs to " +
      "that dialog, not to the fields.",
  },
  "features/masterwork/components/detail/BulkApproveDialog.tsx": {
    kind: "none",
    module: "features/masterwork/components/detail/BulkApproveDialog.tsx",
    why:
      "Its one field is a COUNT — how many of the waiting rules to approve. " +
      "Retyping a number after a reload costs nothing and the rules " +
      "themselves are already on the server; there is no authored work here " +
      "to lose.",
  },
  "features/masterwork/components/detail/RulebookDetailPage.tsx": {
    kind: "none",
    module: "features/masterwork/components/detail/RulebookDetailPage.tsx",
    why:
      "The page's own fields are the rule SEARCH box and the filters over a " +
      "list that lives on the server. Nothing authored is typed into the page " +
      "itself — every lane it opens keeps its own sitting.",
  },
};

/** The answer for a file, or null when nobody has given one. */
export function keepingForSurface(modulePath: string): SurfaceKeeping | null {
  return TEXT_ENTRY_SURFACES[modulePath] ?? null;
}
