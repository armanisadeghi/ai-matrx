// features/unified-data/test-bench/routeFacts.ts
//
// The SHAPE of "does this build serve that address", and nothing else. It is a
// separate file from `routesInThisBuild.ts` because that one is `server-only`
// (it reads the App Router's directory tree) and the screen that renders the
// answer runs in the browser. Types only: nothing here reaches anything.

/** One address, and whether this build has a page at it. `there: null` = we could not tell. */
export interface RouteFact {
  /** What a person would type or follow. */
  path: string;
  there: boolean | null;
}

/** The addresses the try-everything page makes claims about. */
export interface RoutesInThisBuild {
  /** The client portal an outsider signs in to. */
  portal: RouteFact;
  /** The public page a stranger answers a form on, with no account. */
  publicForm: RouteFact;
}
