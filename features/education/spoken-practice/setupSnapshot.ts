"use client";

// features/education/spoken-practice/setupSnapshot.ts
//
// A module snapshot store for the setup half of the
// `matrx-user/education-practice-oral` surface.
//
// Why a store and not a fetch or lifted state: the Surface Context window polls
// the provider's `getScope()` every 400ms while it is open (see
// features/surfaces/runtime/useLiveSurfaceScope.ts), so `getScope` has to stay
// synchronous and cheap — an async emitter here would hammer Supabase behind an
// idle-looking panel. PracticeSetup already owns and has already loaded these
// values, so it publishes them here as they change and the emitter in
// SpokenPracticeSurface reads them back with no network at all. Same pattern as
// the study planner's `plannerSnapshot.ts`.
//
// PracticeSetup CLEARS the slice on unmount, so the runner and the summary
// never emit a setup form that is no longer on screen. The manifest declares
// every value fed from here `alwaysAvailable: false` for exactly that reason.

/** One deck the learner can ground a session in, as the picker lists it. */
export interface PracticeDeckOption {
  id: string;
  name: string;
}

/** The setup form's live field values, while that form is the view on screen. */
export interface PracticeSetupSnapshot {
  mode: string;
  focus: string;
  difficulty: string;
  count: number;
  deckId: string;
  pasted: string;
  /** Whether THIS mode offers deck grounding (drives deck_id's availability). */
  offersDeckGrounding: boolean;
  /** The decks loaded for the picker; empty until the fetch resolves. */
  decks: PracticeDeckOption[];
  /** True while a start is in flight — writes are refused during it. */
  busy: boolean;
}

let setupSnapshot: PracticeSetupSnapshot | null = null;

export function publishPracticeSetupSnapshot(
  next: PracticeSetupSnapshot | null,
): void {
  setupSnapshot = next;
}

export function readPracticeSetupSnapshot(): PracticeSetupSnapshot | null {
  return setupSnapshot;
}
