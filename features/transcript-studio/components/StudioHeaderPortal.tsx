"use client";

/**
 * StudioHeaderPortal — injects studio-specific controls into the global app
 * header via the standard `<PageSpecificHeader>` portal. Renders the
 * active session's title (editable) + the two most-used actions
 * (Record / Save as Transcript) so they stay visible regardless of which
 * column the user is reading or whether the studio header itself has
 * scrolled out of view.
 *
 * The portal target is `#shell-header-center` (SSR shell) or
 * `#page-specific-header-content` (auth layout) — see
 * `components/layout/new-layout/PageSpecificHeader.tsx`. We never write to
 * the right-most slot of the global header; that's reserved for the
 * user-avatar / global controls.
 */

import { PageSpecificHeader } from "@/components/layout/new-layout/PageSpecificHeader";
import type { StudioSession } from "../types";
import { EditableSessionTitle } from "./EditableSessionTitle";
import { RecordButton } from "./recording/RecordButton";
import { SaveAsTranscriptButton } from "./conversion/SaveAsTranscriptButton";
import { DictionaryIndicatorButton } from "@/features/dictionary/components/DictionaryIndicatorButton";

interface StudioHeaderPortalProps {
  session: StudioSession;
}

export function StudioHeaderPortal({ session }: StudioHeaderPortalProps) {
  return (
    <PageSpecificHeader>
      {/*
        The shell header sits over the studio sidebar (shell-main uses a
        negative top margin). A full-width pointer-events:auto wrapper would
        swallow clicks on the sidebar "New" / collapse controls — use none on
        the shell and auto only on the actual header controls.
      */}
      <div className="pointer-events-none flex h-full min-w-0 items-center gap-2 px-2">
        <div className="pointer-events-auto flex shrink-0 items-center gap-1">
          <SaveAsTranscriptButton
            sessionId={session.id}
            hasLinkedTranscript={Boolean(session.transcriptId)}
            variant="icon"
          />
          <RecordButton sessionId={session.id} />
          <DictionaryIndicatorButton surfaceKey="matrx-user/transcript-studio" />
        </div>
        <div className="pointer-events-auto min-w-0 flex-1 truncate text-right">
          <EditableSessionTitle
            sessionId={session.id}
            title={session.title}
            className="w-full text-right"
          />
        </div>
      </div>
    </PageSpecificHeader>
  );
}
