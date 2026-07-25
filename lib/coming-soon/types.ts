// lib/coming-soon/types.ts
//
// A "Coming Soon" is a PROMISE WE MADE TO A USER. It is tracked like a found
// defect, not hidden like an unfinished thought: declared in one registry,
// countable, greppable, and reviewable. See ./FEATURE.md.

/** Where the promise sits on the road to real. */
export type ComingSoonStage =
  /** Intended, nothing built. */
  | "planned"
  /** Actively being built right now. */
  | "building"
  /** Built but gated (deploy pending, flag off, backend not live). */
  | "blocked";

export interface ComingSoonEntry {
  /** Stable id. Also the key in the registry. kebab-case, feature-prefixed. */
  id: string;
  /** What the user sees as the action label, e.g. "Create App from Agent". */
  label: string;
  /** Feature that owns delivering it, e.g. "agents". Used for grouping. */
  owner: string;
  /** One sentence: what it will DO for the user when it lands. */
  promise: string;
  stage: ComingSoonStage;
  /**
   * What is actually standing in the way. Required for `blocked` — a blocked
   * promise with no named blocker is an untracked defect wearing a nicer hat.
   */
  blockedBy?: string;
  /** Where this shows up, e.g. ["/agents/browse row menu"]. */
  surfaces: string[];
}

export type ComingSoonId = string;
