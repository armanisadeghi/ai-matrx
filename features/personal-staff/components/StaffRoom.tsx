"use client";

/**
 * StaffRoom — `/staff`'s body: the person's ONE staff conversation, the same
 * thread their texts and calls use.
 *
 * WHAT THIS COMPONENT DOES AND DOES NOT DO. It asks the door for the thread
 * (`features/personal-staff/staff-door.ts`) and then gets out of the way:
 * everything below is the canonical chat surface, `ChatRoomClient`, mounted
 * exactly as `/chat/[conversationId]` mounts it — same `AgentConversationColumn`
 * behind it, same `constrainWidth` + `edgeToEdgeScroll`, same composer. There
 * is no second chat implementation here, and there must never be one.
 *
 * THE RUN GOES THROUGH THE MANDATE, NOT THE AGENT. `agentId` is DISPLAY
 * identity; `mandateKey` is `personal_staff.front_line`, so every turn POSTs
 * `/ai/mandates/{key}` and aidream resolves the Holder for this principal. An
 * organization or a person rebinding the role changes who answers with no
 * client deploy — and the id is never a literal (`MANDATE_KEYS`, guarded by
 * `pnpm check:mandate-keys`).
 *
 * NOTHING FAILS SILENTLY. Every refusal the door names is rendered as the
 * server's own sentence with something to do about it, and the missing-sandbox
 * case is an honest one-line note with a door onto `/sandbox` — never a scary
 * banner, never a repeated toast.
 */

import { useEffect, useState } from "react";
import { CircleAlert, HardDrive } from "lucide-react";
import Link from "next/link";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAccessToken,
  selectAuthReady,
} from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { ChatRoomClient } from "@/features/agents/components/chat/ChatRoomClient";
import { ChatRoomSkeleton } from "@/features/agents/components/chat/ChatRoomSkeleton";
import { useDeclaredSurfaceMandates } from "@/features/surfaces/runtime/surface-mandates";
import {
  PERSONAL_STAFF_MANDATE_KEY,
  openStaffThread,
  staffDoorFailure,
  type StaffDoorFailure,
  type StaffThread,
} from "../staff-door";
import { STAFF_SURFACE_NAME } from "@/features/surfaces/manifests/staff.manifest";
import type { SourceFeature } from "@/types/python-generated/source-attribution";
import {
  clearResolvedStaffHolder,
  publishResolvedStaffHolder,
} from "../staff-holder-store";

/** Where an administrator assigns the role when nobody holds it. */
const MANDATE_CONSOLE_HREF = `/mandates/${PERSONAL_STAFF_MANDATE_KEY}`;
/** Where a person starts a box of their own. */
const SANDBOX_HREF = "/sandbox";

/**
 * THE ROOM OWNS ITS OWN URL. `ChatRoomClient` navigates to
 * `buildConversationHref(id)` the moment a fresh conversation gets an id; its
 * DEFAULT is `/chat/<id>`, which would throw a person out of their staff room
 * and into a bare chat mid-turn. `/staff` is the room's one address: the thread
 * is resolved by the staff door (`openStaffThread`), never by a URL segment, so
 * the conversation id does not belong in the path.
 */
const staffRoomHref = () => "/staff";

/**
 * Conversation provenance for a staff turn. Registered in aidream's
 * `source_attribution.py` allow-list; an unregistered slug is refused by
 * `AgentStartRequest` outright, so this is never invented here.
 *
 * Typed against the generated mirror (`SOURCE_FEATURES`), which this change
 * brought level with the server via `pnpm sync-types` — so a retirement on the
 * server becomes a compile error here rather than a 422 nobody sees.
 */
const STAFF_SOURCE_FEATURE: SourceFeature = "personal-staff";

type DoorState =
  | { status: "opening" }
  | { status: "open"; thread: StaffThread }
  | { status: "refused"; failure: StaffDoorFailure };

export interface StaffRoomProps {
  /** The Holder the page resolved at SSR, for the chat shell's first paint. */
  seedAgentId: string | null;
}

export function StaffRoom({ seedAgentId }: StaffRoomProps) {
  const authReady = useAppSelector(selectAuthReady);
  const accessToken = useAppSelector(selectAccessToken);
  const organizationId = useAppSelector(selectOrganizationId);
  const [state, setState] = useState<DoorState>({ status: "opening" });
  const [attempt, setAttempt] = useState(0);

  // Disclosure only — renders nothing, adds nothing to the page. The staff job
  // is the one fixed AI job this surface runs, and it is named by its MANDATE
  // KEY so the menu row survives a rebind.
  useDeclaredSurfaceMandates([
    {
      mandateKey: PERSONAL_STAFF_MANDATE_KEY,
      does: "Answers your staff thread — the same conversation your texts and calls use.",
      surfaceName: STAFF_SURFACE_NAME,
    },
  ]);

  useEffect(() => {
    if (!authReady) return undefined;
    // No organization selected yet: ask the door anyway is NOT the move — the
    // transport is fail-closed and would throw before networking. Render the
    // door's own `organization_required` sentence instead, with the picker
    // behind it. The words are the server's, quoted from `door.py`, so this
    // screen and the server's cannot drift.
    if (!accessToken || !organizationId) {
      setState({
        status: "refused",
        failure: {
          code: "organization_required",
          message:
            "Choose which organization you are working in and your staff will open there.",
          status: null,
        },
      });
      return undefined;
    }
    const controller = new AbortController();
    setState({ status: "opening" });
    void (async () => {
      try {
        const thread = await openStaffThread({
          accessToken,
          organizationId,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setState({ status: "open", thread });
      } catch (error) {
        if (controller.signal.aborted) return;
        // Scream: a door that refused is an event worth a line in the console
        // even though the person is about to read the server's own sentence.
        console.error("[/staff] the staff door refused to open:", error);
        setState({ status: "refused", failure: staffDoorFailure(error) });
      }
    })();
    return () => controller.abort();
  }, [authReady, accessToken, organizationId, attempt]);

  if (state.status === "opening") {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-textured">
        <ChatRoomSkeleton />
      </div>
    );
  }

  if (state.status === "refused") {
    return (
      <StaffDoorRefusal
        failure={state.failure}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  }

  return <StaffThreadRoom thread={state.thread} seedAgentId={seedAgentId} />;
}

/**
 * The thread itself. Split out so the Holder publish and the sandbox note are
 * mounted only once a thread actually exists.
 */
function StaffThreadRoom({
  thread,
  seedAgentId,
}: {
  thread: StaffThread;
  seedAgentId: string | null;
}) {
  const { agent_id: agentId, agent_name: agentName } = thread;
  // Tell the header who actually answers.
  //
  // IN AN EFFECT, NOT DURING RENDER. Publishing during render was the obvious
  // way to avoid a one-frame flash, and it is wrong: the store notifies the
  // header's `useSyncExternalStore` synchronously, so React logged "Cannot
  // update a component while rendering a different component" on every open
  // (caught on localhost, 2026-09-20). There is no flash to avoid anyway — the
  // header's first paint is the SSR-resolved system-rung Holder, a REAL name,
  // and this only replaces it when the door resolved a different rung.
  useEffect(() => {
    publishResolvedStaffHolder({ agentId, agentName });
    return clearResolvedStaffHolder;
  }, [agentId, agentName]);

  // THE BOX IS NOT SEEDED FROM HERE. `bind_staff_sandbox` already bound it
  // server-side, and the door returns only the instance id — not the proxy
  // URL a `ConversationSandboxBinding` needs. Inventing one would be worse
  // than the round-trip: the room's own `useConversationSandboxBindingSync`
  // and the bundle read derive the real binding from the row, which is the
  // one place it lives.
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {thread.sandbox_note ? (
        <StaffSandboxNote note={thread.sandbox_note} />
      ) : null}
      <div className="min-h-0 flex-1">
        <ChatRoomClient
          agentId={agentId || seedAgentId || ""}
          conversationId={thread.conversation_id}
          mandateKey={PERSONAL_STAFF_MANDATE_KEY}
          // Attribution: these turns are the staff's, not `/chat`'s. The slug
          // is an aidream allow-list and `personal-staff` is registered there
          // (`source_attribution.py`); an unregistered one is refused outright.
          sourceFeature={STAFF_SOURCE_FEATURE}
          buildConversationHref={staffRoomHref}
        />
      </div>
    </div>
  );
}

/**
 * The honest note, once. The server writes the sentence; this adds the door
 * (`/sandbox`) it implies. Quiet by design — a missing box is a lesser
 * arrangement, not a failure.
 */
function StaffSandboxNote({ note }: { note: string }) {
  return (
    // 🚨 `pt-[var(--shell-header-h)]` IS NOT DECORATION. `.shell-main` is pulled
    // up behind the transparent header, so a page's own FIRST row draws inside
    // the header band — where `.shell-header-inject` sits on top of it and
    // swallows every click. Measured on localhost before this line: the note
    // painted at y=9 with a 44px header and `elementFromPoint` on "Start a
    // sandbox" returned the header, not the link. It looked fine and did
    // nothing. The offset is on the NOTE only: the conversation column below
    // reserves its own, and putting it on the body would push the whole room
    // down by a header's height.
    <div className="flex shrink-0 items-start gap-2 border-b border-border bg-muted/40 px-4 py-2 pt-[calc(var(--shell-header-h)+0.5rem)]">
      <HardDrive
        aria-hidden
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
      />
      <p className="min-w-0 text-xs text-muted-foreground">
        {note}{" "}
        <Link
          href={SANDBOX_HREF}
          className="font-medium text-foreground underline underline-offset-2"
        >
          Start a sandbox
        </Link>
      </p>
    </div>
  );
}

/**
 * A refusal is a screen, never a blank page and never a dead control.
 *
 * The SENTENCE is the server's, verbatim — `door.py` writes each one for a
 * person, and a second copy here would drift the moment either side changed.
 * What this file owns is the ACTION beside it, which is the part the server
 * cannot know: which screen in this app answers that particular refusal.
 */
function StaffDoorRefusal({
  failure,
  onRetry,
}: {
  failure: StaffDoorFailure;
  onRetry: () => void;
}) {
  return (
    <div className="h-full overflow-hidden bg-textured">
      <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
        <div className="mx-auto w-full max-w-xl rounded-md border border-border bg-card px-4 py-6 text-center">
          <CircleAlert aria-hidden className="mx-auto h-6 w-6 text-warning" />
          <p className="mx-auto mt-3 max-w-md text-sm text-foreground">
            {failure.message}
          </p>
          <div className="mt-4 flex justify-center">
            <StaffRefusalAction failure={failure} onRetry={onRetry} />
          </div>
        </div>
      </div>
    </div>
  );
}

const ACTION_CLASS =
  "inline-flex min-h-11 items-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:min-h-9";

function StaffRefusalAction({
  failure,
  onRetry,
}: {
  failure: StaffDoorFailure;
  onRetry: () => void;
}) {
  if (failure.code === "organization_required") {
    return <ChooseOrganizationAction onChosen={onRetry} />;
  }
  if (failure.code === "no_holder" || failure.code === "holder_is_not_an_agent") {
    return (
      <Link href={MANDATE_CONSOLE_HREF} className={ACTION_CLASS}>
        Open the mandate console
      </Link>
    );
  }
  return (
    <button type="button" className={ACTION_CLASS} onClick={onRetry}>
      Try again
    </button>
  );
}

/**
 * The organization hold, answered the way every other held request in this app
 * answers it: the person is shown their memberships, SETS one, and the request
 * proceeds. Nothing is substituted for them.
 */
function ChooseOrganizationAction({ onChosen }: { onChosen: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <button
      type="button"
      className={ACTION_CLASS}
      disabled={asking}
      onClick={async () => {
        setAsking(true);
        // Imported here so a visitor who never meets this refusal does not
        // pull the picker's graph into this chunk.
        const gate = await import("@/lib/organization/organization-gate");
        try {
          await gate.ensureOrganizationContext();
          // The selection is global; the effect above re-opens the door with
          // it as soon as Redux carries it, and this nudge covers the case
          // where the person re-picks the organization they already had.
          onChosen();
        } catch (error) {
          // "Not now" is an ANSWER, not a failure: leave the screen as it is,
          // with the same button still offering the same choice.
          if (!gate.isOrganizationSelectionCancelled(error)) {
            console.error("[/staff] choosing an organization failed:", error);
          }
        } finally {
          setAsking(false);
        }
      }}
    >
      {asking ? "Choosing…" : "Choose an organization"}
    </button>
  );
}
