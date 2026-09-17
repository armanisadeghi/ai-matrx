// features/masterwork/sitting/lanePersistence.ts
//
// EVERY CAPTURE LANE DECLARES WHAT HAPPENS TO IN-PROGRESS WORK ON A RELOAD.
//
// ## The class this closes
//
// Cold walk 4 (2026-09-16) found the Triad erasing an answered round on a
// reload. It was fixed there. Cold walk 5 found the identical defect on the
// Sorting Table. It was fixed there, and the mechanism was lifted into
// `./sitting.ts` so the next lane would inherit it. Cold walk 6 (2026-09-17)
// found it AGAIN, on the Red-Pen lane and the Daily Drip — and the census that
// walk triggered found it on every remaining capture dialog on the Rulebook
// page: Red-Pen, the Prediction Ledger, all four ingest lanes, "Everything
// you've published", Shadow-the-inbox and the unfolding case each swallowed a
// real sentence on a plain browser reload and said nothing about it.
//
// Three walks in a row found one class lane by lane. The reason it kept
// recurring is that a NEW lane could ship without anyone ever being asked the
// question — the registry grows rows, the rows grow doors, and nothing in the
// build made "and what happens when she reloads?" a thing you had to answer.
//
// So this file is the answer, written down per lane, and
// `__tests__/every-lane-keeps-its-work.test.ts` reads the LIVE Approach
// registry and fails when a lane an Expert can actually start has no entry
// here — or has one that the code does not back up.
//
// ## What counts as declared
//
// Not "it feels fine". One of four, each of which is a real mechanism a test
// can point at:
//
//   sitting      — the lane keeps its own working state through
//                  `createSittingStore` + `useDialogSitting` (or the round-
//                  shaped store directly). The named module must actually
//                  call it.
//   server-run   — there is nothing on screen that is not already on the
//                  server: the durable run holds the rounds, and a reload
//                  rejoins it. The named module must use a durable run.
//   server-write — every keystroke-level unit of work is written to the
//                  server as it happens (a conversation turn, an approved
//                  rule), so the browser holds nothing worth keeping.
//   none         — the lane has no in-progress state at all: it is a set of
//                  doors, or a single click.
//
// A `why` is required on everything except `sitting`, because the other three
// are claims about the lane's shape that the next person has to be able to
// check.

/** The four honest answers. Anything else is an undeclared lane. */
export type LanePersistence =
  | {
      kind: "sitting";
      /** Repo-relative module that must call the sitting primitive. */
      module: string;
      /** What is kept, in the Expert's terms. */
      keeps: string;
    }
  | {
      kind: "server-run";
      /** Repo-relative module that must use a durable run. */
      module: string;
      why: string;
    }
  | { kind: "server-write"; module: string; why: string }
  | { kind: "none"; module: string; why: string };

/**
 * Keyed by lane identity: an `ApproachLane["kind"]`, and for the ingest dialog
 * `ingest:<lane>` because its five lanes are five different pieces of work.
 */
export const LANE_PERSISTENCE: Record<string, LanePersistence> = {
  href: {
    kind: "server-write",
    module: "app/(core)/masterwork/vision-interview/[sessionId]/page.tsx",
    why:
      "A `launch_href` row opens its own page. The only live one is the Vision " +
      "Interview, whose every turn is a server-side session row — walk 6 drove " +
      "three turns, left for /dashboard, came back and lost nothing.",
  },
  interview: {
    kind: "server-write",
    module: "features/masterwork/components/detail/ScoutInterviewPanel.tsx",
    why:
      "The Scout interview IS a conversation: every turn is persisted by the " +
      "conversation engine before it is rendered, and the panel rejoins it by id.",
  },
  "ingest:source": {
    kind: "sitting",
    module: "features/masterwork/components/detail/IngestSourceDialog.tsx",
    keeps: "the pasted material and what the Expert called it",
  },
  "ingest:exemplar": {
    kind: "sitting",
    module: "features/masterwork/components/detail/IngestSourceDialog.tsx",
    keeps: "the pasted finished work and what the Expert called it",
  },
  "ingest:file": {
    kind: "sitting",
    module: "features/masterwork/components/detail/IngestSourceDialog.tsx",
    keeps:
      "what the Expert called the file. The FILE itself cannot be kept — a " +
      "browser may not re-open a local file without the person picking it again",
  },
  "ingest:timeline": {
    kind: "sitting",
    module: "features/masterwork/components/detail/IngestSourceDialog.tsx",
    keeps: "the case as typed, and whether the ending is held back",
  },
  "ingest:monologue": {
    kind: "sitting",
    module: "features/masterwork/components/detail/IngestSourceDialog.tsx",
    keeps:
      "what the Expert called the recording. A recording in flight is owned by " +
      "the platform's one recorder, not by this dialog",
  },
  body_of_work: {
    kind: "sitting",
    module: "features/masterwork/components/detail/BodyOfWorkDialog.tsx",
    keeps: "the links listed so far and what they were called",
  },
  chatImport: {
    kind: "sitting",
    module: "features/masterwork/components/detail/ChatImportDialog.tsx",
    keeps: "the pasted chat, what it was called, and the topic",
  },
  dump: {
    kind: "none",
    module: "features/masterwork/components/detail/RulebookSourcesPanel.tsx",
    why:
      "The dump lane is a panel of doors — it holds no typed work of its own; " +
      "every door it opens keeps its own sitting.",
  },
  meeting: {
    kind: "sitting",
    module: "features/masterwork/components/detail/MeetingScavengerDialog.tsx",
    keeps: "the pasted meeting and what it was called",
  },
  conduct: {
    kind: "server-write",
    module: "features/masterwork/conduct/ConductorPanel.tsx",
    why:
      "The Conductor is a live conversation; every turn is persisted by the " +
      "conversation engine and rejoined by id.",
  },
  triad: {
    kind: "sitting",
    module: "features/masterwork/triad/TriadGamePage.tsx",
    keeps: "the cards dealt, which one she is on, and every answer already given",
  },
  redPen: {
    kind: "sitting",
    module: "features/masterwork/components/detail/RedPenDialog.tsx",
    keeps:
      "the work being marked up, what it was called, and every correction saved against it",
  },
  unfolding: {
    kind: "sitting",
    module: "features/masterwork/components/detail/IngestTimelineDialog.tsx",
    keeps: "the case as typed, with its title and its provenance fields",
  },
  probe: {
    kind: "server-run",
    module: "features/masterwork/probe/BadExampleProbe.tsx",
    why:
      "Every round is a durable run on the server — the written-for-you piece " +
      "and the Expert's answer to it are both rows before they are pixels, and " +
      "a reload rejoins the run rather than restarting it.",
  },
  prediction: {
    kind: "sitting",
    module: "features/masterwork/prediction/PredictionLedgerDialog.tsx",
    keeps: "the call being written — the case, the prediction, the reason and the date",
  },
  shadowInbox: {
    kind: "sitting",
    module: "features/masterwork/components/detail/ShadowInboxDialog.tsx",
    keeps: "the thread pasted in and what it was called",
  },
  sortingTable: {
    kind: "sitting",
    module: "features/masterwork/sorting/SortingTablePage.tsx",
    keeps: "the pile dealt, which case she is on, and every case already sorted",
  },
  teachBack: {
    kind: "server-run",
    module: "features/masterwork/teach-back/TeachBack.tsx",
    why:
      "Each round — the explanation and the Expert's correction of it — is a " +
      "durable run row. Walk 6 reloaded between two rounds and continued.",
  },
  plan: {
    kind: "sitting",
    module: "features/masterwork/capture-plan/CapturePlanPage.tsx",
    keeps:
      "the plan being set up before it is built — what the Expert wants covered and the minutes they have",
  },
  drip: {
    kind: "sitting",
    module: "features/masterwork/drip/DailyDripDialog.tsx",
    keeps: "the answer to today's question, as far as it has been typed",
  },
};

/**
 * The persistence declared for a resolved lane, or null when nobody has
 * answered the question for it yet. Null is the guard's failure, never a
 * default — a lane with no answer is a lane that will lose somebody's work.
 */
export function persistenceForLane(
  lane: { kind: string; lane?: string } | null,
): LanePersistence | null {
  if (!lane) return null;
  const key = lane.kind === "ingest" ? `ingest:${lane.lane}` : lane.kind;
  return LANE_PERSISTENCE[key] ?? null;
}
