"use client";

// useWorkingDocChanges — tracks "what the agent last changed" in the working
// document so a surface can offer a subtle "view changes" affordance.
//
// The before-snapshot problem (see Feature 6 spec): to diff "what the agent
// LAST changed" we need the document content the user last *saw* versus the
// content the agent just produced. The working doc is collaborative — the agent
// edits it server-side via ctx_patch and the writes arrive through realtime as
// `remoteContent`, while the user edits a local `draft` that autosaves back
// (and then also returns as `remoteContent`). So a naive prev-vs-current diff
// would flag the user's OWN edits as "agent changes".
//
// This hook keeps a local "seen" snapshot — the last content the user
// acknowledged — and only raises `hasUnseenChange` when `remoteContent` drifts
// to something that is neither the seen snapshot nor the user's own draft. That
// is, by construction, an edit that came from somewhere other than this user:
// the agent. `markSeen()` advances the snapshot to the current content (used by
// "view changes" accept/dismiss and after the diff is opened).
//
// It is intentionally generic and self-contained (no Redux, no war-room/scribe
// coupling) so both the Scribe working-doc surface and the War Room tile share
// one implementation through WorkingDocumentHeader.

import { useCallback, useEffect, useRef, useState } from "react";

export interface WorkingDocChanges {
  /** True when the live content differs from what the user has seen AND the
   *  difference did not come from the user's own draft (i.e. the agent). */
  hasUnseenChange: boolean;
  /** The last-seen snapshot — the "before" for the diff. */
  before: string;
  /** The current live content — the "after" for the diff. */
  after: string;
  /** Acknowledge the current content: advances the seen snapshot and clears
   *  `hasUnseenChange`. Call from the diff's accept/dismiss and on open. */
  markSeen: () => void;
}

/** Cheap normalize so trailing-whitespace / CRLF echoes don't read as changes. */
function norm(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

export function useWorkingDocChanges(
  /** Live document content (realtime / agent edits land here). */
  remoteContent: string,
  /** The user's local editable buffer, so their own edits aren't flagged. */
  draft: string,
): WorkingDocChanges {
  // "seen" = the content the user has acknowledged (the diff's "before").
  // "after" = the current live content. Both seed lazily to whatever content
  // exists at mount, so an existing doc opening fresh shows no spurious change.
  const [seen, setSeen] = useState<string>(() => remoteContent);
  const [after, setAfter] = useState<string>(() => remoteContent);

  // Live ref of the user's draft so the effect can compare without re-running
  // every keystroke (the effect depends only on remoteContent).
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Has the persisted document loaded yet? At mount `remoteContent` is usually
  // EMPTY (the doc fetch / realtime hydration hasn't landed), so seeding `seen`
  // to that empty value and then receiving the real content would read the
  // PERSISTED doc as an unseen "agent change" on every page refresh. The first
  // non-empty content after mount is the baseline the user is returning to —
  // acknowledge it as seen, never flag it.
  const baselinedRef = useRef(norm(remoteContent).length > 0);

  useEffect(() => {
    setAfter(remoteContent);
    if (!baselinedRef.current) {
      if (norm(remoteContent).length > 0) {
        baselinedRef.current = true;
        setSeen(remoteContent);
      }
      return;
    }
    // The change matches the user's own in-flight draft → it's the user's edit
    // echoing back through autosave/realtime. Acknowledge it silently so it is
    // never flagged as an agent change. (Also covers the no-drift case once the
    // draft has caught up to the seen content.)
    if (norm(remoteContent) === norm(draftRef.current)) {
      setSeen(remoteContent);
    }
    // Otherwise leave `seen` where it is: the live content came from elsewhere
    // (the agent), so `before` stays the pre-agent content and the derived
    // `hasUnseenChange` below lights up.
  }, [remoteContent]);

  const markSeen = useCallback(() => {
    setSeen(after);
  }, [after]);

  const hasUnseenChange = norm(after) !== norm(seen) && after.trim().length > 0;

  return { hasUnseenChange, before: seen, after, markSeen };
}
