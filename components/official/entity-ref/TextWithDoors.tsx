"use client";

/**
 * TextWithDoors — THE way to print a sentence somebody else wrote.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md) does not stop at table
 * cells: if the UI NAMES a thing that has an identity in our system, the UI
 * must let the user reach it. A server refusal that says
 *
 *     resolved system agent 8f0bbfc2-85d9-4913-8cea-b09a50c62be6 breaks the
 *     mandate contract: declares no structured output_schema
 *
 * names an agent. Printed as flat text it is a dead end with extra steps — the
 * person is told which record is wrong and then made to hand-copy a uuid into
 * a URL bar to go look at it. That is the defect this component closes, and it
 * closes it for the whole class: every surface that prints a server sentence
 * (`ServerNotes`, refusal banners, dropped-rung reasons, run failures) renders
 * it through here instead of through a bare `{message}`.
 *
 * VERBATIM. The server is the authority on what it just said, so nothing here
 * rewrites, shortens or re-orders a word — `segmentSentenceIds` preserves every
 * character in order. The only change is that the ids become openable, with the
 * full id still on screen (`name={id}`), never truncated to `8f0bbfc2…`.
 *
 * THE AUTHOR'S OWN MARKS ARE HONOURED, NOT PRINTED. A sentence that says its
 * field names in markdown backticks meant them as code; this is the one place
 * that renders them as `<code>`, so no surface needs — or is allowed to grow —
 * a second inline-markdown renderer of its own. See `doors.ts`
 * § INLINE CODE, THE WAY ITS AUTHOR WROTE IT.
 *
 * CONSERVATIVE. An id becomes a door only when the sentence's own words name an
 * entity type the platform can actually open, or the call site declares one via
 * `defaultToken`. Anything else stays plain text: a link to the wrong record
 * reads as a fact and is a lie, which the doctrine ranks below no link at all.
 */

import React from "react";
import { EntityRef } from "./EntityRef";
import { segmentSentenceIds } from "./doors";

export interface TextWithDoorsProps {
  /** The sentence, exactly as its author wrote it. */
  text: string | null | undefined;
  /**
   * The entity type this surface KNOWS its sentences are about, used only when
   * the prose names nothing openable — a mandate-resolution refusal is always
   * about an agent, and its screen may say so.
   */
  defaultToken?: string | null;
  /**
   * Ids open in a NEW TAB (default). These sentences live in banners, panels
   * and sheets over work in progress; navigating the tab away to go read the
   * accused record is the data loss the new-tab door exists to prevent.
   */
  openInNewTab?: boolean;
  /** Classes for each id's `EntityRef` wrapper. */
  refClassName?: string;
}

export function TextWithDoors({
  text,
  defaultToken,
  openInNewTab = true,
  refClassName,
}: TextWithDoorsProps) {
  if (!text) return null;
  const segments = segmentSentenceIds(text, defaultToken);
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === "text" ? (
          // Position IS the identity of a prose run — the segments are a
          // deterministic split of one immutable string, never a reorderable list.
          <React.Fragment key={`t${index}`}>{segment.text}</React.Fragment>
        ) : segment.kind === "code" ? (
          // 🚨 THE AUTHOR'S BACKTICKS ARE MARKUP, NOT WORDS (R-O2). A sentence
          // naming `title` and `slides` reaches a subject matter expert, and
          // the marks are how its author said "these are field names" — so
          // they become a `<code>`, not two stray punctuation characters on
          // the screen. Same font treatment as an id, one class of thing.
          <code
            key={`c${index}`}
            className="rounded bg-muted px-1 py-px font-mono text-[0.95em]"
          >
            {segment.text}
          </code>
        ) : (
          <EntityRef
            key={`r${index}:${segment.id}`}
            token={segment.token}
            id={segment.id}
            // The full id stays on screen: the sentence is verbatim, and an
            // ellipsis would destroy the very string the reader came to copy.
            name={segment.id}
            showIcon={false}
            // NO HOVER CONTROLS MID-SENTENCE. `EntityRef`'s peek/new-tab
            // controls are laid out inline and reserve their width even while
            // invisible, which opens a hole in the middle of the server's
            // sentence — the one thing this component promises not to do. The
            // label itself is the door here, and it opens in a new tab.
            disablePeek
            disableNewTab
            wrap
            openInNewTab={openInNewTab}
            className={refClassName ?? "align-baseline font-mono text-[0.95em]"}
          />
        ),
      )}
    </>
  );
}
