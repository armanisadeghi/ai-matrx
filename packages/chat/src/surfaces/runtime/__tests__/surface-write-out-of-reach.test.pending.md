<!-- Pending implementation; preserved from the integration sweep. -->

/**
 * FORCING GUARD — the dead-chat class (live defect, 2026-09-12).
 *
 * A Masterwork Conductor conversation bound to `/masterwork/<id>/conduct` was
 * reopened in a plain `/chat/<id>` tab through the agent's own "open the full
 * conversation in a new tab" link. The agent called `apply_surface_write` with
 * target `rule_draft`; no mounted surface on the chat route declares it, so the
 * write could never land — and the screen said NOTHING. Six minutes of dead
 * chat.
 *
 * This guard is green only when the real chain works end to end:
 *
 *   real `applySurfaceWrite` failure
 *     → the real `activeRequests` reducer, fed the exact actions
 *       `surfaceDelegatedToolCall` + `dispatchSurfaceWrite` dispatch
 *     → the real selector over that state
 *     → the real reach rule over the REAL manifest registry
 *     → the real presenter's rendered markup.
 *
 * Nothing in that chain is stubbed. The only fakes are the toast sink, the
 * diagnostics sink, the Redux hooks module and `AppLink` — none of which is
 * under test, and none of which can make a missing notice look present.
 */

const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
const mockCaptureError = jest.fn();

jest.mock("@/lib/toast", () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: mockCaptureError,
}));
// The presenter is pure; the container's store hook is not under test and the
// whole Redux store is not worth dragging into jsdom for it.
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => undefined,
  useAppDispatch: () => () => undefined,
}));
jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import activeRequestsReducer, {
  createRequest,
  upsertToolLifecycle,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { getAllManifests } from "@/features/surfaces/manifests/registry";

import { registerSurfaceRuntime } from "../SurfaceRuntimeContext";
import {
  applySurfaceWrite,
  SURFACE_WRITE_TOOL_NAME,
} from "../surface-writeback";
import {
  selectConversationLaunchSurface,
  selectFailedSurfaceWriteTargets,
  type WriteReachState,
} from "../conversation-write-reach.selectors";
import {
  describeOutOfReachSurfaceWrite,
  resolveSurfaceHref,
} from "../surface-write-reach";
import { SurfaceWriteOutOfReachNotice } from "../../components/SurfaceWriteOutOfReachNotice";

// The surface + target the live defect actually used.
const RULEBOOK_SURFACE = "matrx-user/masterwork-rulebook";
const RULE_DRAFT = "rule_draft";
const CHAT_SURFACE = "matrx-user/chat";

const CONVERSATION_ID = "conv-dead-chat";
const REQUEST_ID = "req-1";
const CALL_ID = "call-1";

/** Mount ONLY the chat surface — exactly what `/chat/[id]` mounts. */
function mountChatSurfaceOnly(): () => void {
  return registerSurfaceRuntime({
    surfaceName: CHAT_SURFACE,
    getScope: () => ({}),
    getWriteHandlers: () => ({}),
  });
}

/**
 * Build `activeRequests` state through the REAL reducer using the REAL actions
 * the delegated-call path dispatches:
 *   - `surfaceDelegatedToolCall` → upsertToolLifecycle(status "started",
 *     arguments = the `tool_delegated` event data, `{ arguments: {...} }`)
 *   - `dispatchSurfaceWrite`'s `finish()` → upsertToolLifecycle(status
 *     "error", errorType "surface_write_failed", errorMessage = the seam's own
 *     sentence).
 */
function stateAfterFailedWrite(
  failureMessage: string,
  launchSurfaceName: string | null,
): WriteReachState {
  let activeRequests = activeRequestsReducer(undefined, {
    type: "@@init",
  } as never);
  activeRequests = activeRequestsReducer(
    activeRequests,
    createRequest({ requestId: REQUEST_ID, conversationId: CONVERSATION_ID }),
  );
  activeRequests = activeRequestsReducer(
    activeRequests,
    upsertToolLifecycle({
      requestId: REQUEST_ID,
      callId: CALL_ID,
      toolName: SURFACE_WRITE_TOOL_NAME,
      status: "started",
      arguments: { arguments: { target: RULE_DRAFT, value: { mode: "new" } } },
      isDelegated: true,
    }),
  );
  activeRequests = activeRequestsReducer(
    activeRequests,
    upsertToolLifecycle({
      requestId: REQUEST_ID,
      callId: CALL_ID,
      toolName: SURFACE_WRITE_TOOL_NAME,
      status: "error",
      isDelegated: true,
      result: {
        ok: false,
        reason: "surface_write_failed",
        message: failureMessage,
      },
      errorType: "surface_write_failed",
      errorMessage: failureMessage,
    }),
  );
  return {
    conversations: {
      byConversationId: {
        [CONVERSATION_ID]: { surfaceName: launchSurfaceName },
      },
    },
    activeRequests: activeRequests as unknown as WriteReachState["activeRequests"],
  };
}

describe("a surface-bound conversation opened in plain chat", () => {
  let unmount: (() => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    unmount?.();
    unmount = null;
  });

  it("the write really cannot land on the chat route (the precondition)", async () => {
    unmount = mountChatSurfaceOnly();
    const result = await applySurfaceWrite(RULE_DRAFT, { mode: "new" }, {
      origin: "agent",
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(
      `No mounted surface declares write target "${RULE_DRAFT}"`,
    );
  });

  it("says so on screen, naming the page in the user's words", async () => {
    unmount = mountChatSurfaceOnly();
    // The REAL failure sentence, produced by the real seam a line above.
    const failure = await applySurfaceWrite(RULE_DRAFT, { mode: "new" }, {
      origin: "agent",
    });
    expect(failure.ok).toBe(false);

    // A FRESH TAB: `cx_conversation` stores no surface, so the launch stamp is
    // gone. The agent's own failed attempt is the only evidence left.
    const state = stateAfterFailedWrite(
      failure.ok ? "" : failure.error,
      null,
    );
    expect(selectConversationLaunchSurface(state, CONVERSATION_ID)).toBeNull();
    expect(selectFailedSurfaceWriteTargets(state, CONVERSATION_ID)).toEqual([
      RULE_DRAFT,
    ]);

    const notice = describeOutOfReachSurfaceWrite({
      launchSurfaceName: selectConversationLaunchSurface(
        state,
        CONVERSATION_ID,
      ),
      attemptedTargetNames: selectFailedSurfaceWriteTargets(
        state,
        CONVERSATION_ID,
      ),
      mountedSurfaceNames: [CHAT_SURFACE],
    });
    expect(notice).not.toBeNull();
    expect(notice!.surfaceName).toBe(RULEBOOK_SURFACE);
    expect(notice!.evidence).toBe("attempt");
    expect(notice!.targetLabels).toEqual(["Rule draft"]);

    const markup = renderToStaticMarkup(
      <SurfaceWriteOutOfReachNotice notice={notice!} />,
    );
    // Names the page the user knows, names what cannot happen, and never
    // pretends otherwise.
    expect(markup).toContain(notice!.surfaceLabel);
    expect(markup).toContain("can’t be applied from this chat");
    expect(markup).toContain("Rule draft");
  });

  it("never renders a broken link — a per-item page says why instead", () => {
    unmount = mountChatSurfaceOnly();
    const notice = describeOutOfReachSurfaceWrite({
      launchSurfaceName: RULEBOOK_SURFACE,
      mountedSurfaceNames: [CHAT_SURFACE],
    });
    expect(notice).not.toBeNull();
    expect(notice!.evidence).toBe("launch");
    // `/masterwork/[rulebookId]` — an address this chat cannot fill in.
    expect(notice!.href).toBeNull();
    expect(notice!.noLinkReason).toBeTruthy();
    const markup = renderToStaticMarkup(
      <SurfaceWriteOutOfReachNotice notice={notice!} />,
    );
    expect(markup).not.toContain("<a ");
    expect(markup).toContain(notice!.noLinkReason!);
  });

  it("gives the one-click remedy whenever the surface has a real address", () => {
    // Discovered from the REAL registry, not hand-picked: any surface with a
    // static route and an agent-writable target must produce a working link.
    const linkable = getAllManifests().find(
      (manifest) =>
        resolveSurfaceHref(manifest).href !== null &&
        (manifest.writeTargets ?? []).some(
          (target) => (target.applyPolicy ?? "manual") !== "manual",
        ),
    );
    expect(linkable).toBeDefined();

    const notice = describeOutOfReachSurfaceWrite({
      launchSurfaceName: linkable!.surfaceName,
      mountedSurfaceNames: [CHAT_SURFACE],
    });
    expect(notice).not.toBeNull();
    expect(notice!.href).toBe(linkable!.urlPattern);
    const markup = renderToStaticMarkup(
      <SurfaceWriteOutOfReachNotice notice={notice!} />,
    );
    expect(markup).toContain(`href="${linkable!.urlPattern}"`);
    expect(markup).toContain(`Open ${linkable!.label}`);
  });

  it("stays silent when the bound surface IS mounted (no always-on banner)", () => {
    expect(
      describeOutOfReachSurfaceWrite({
        launchSurfaceName: RULEBOOK_SURFACE,
        attemptedTargetNames: [RULE_DRAFT],
        mountedSurfaceNames: [RULEBOOK_SURFACE, CHAT_SURFACE],
      }),
    ).toBeNull();
  });

  it("stays silent for a plain chat conversation with nothing bound", () => {
    expect(
      describeOutOfReachSurfaceWrite({
        launchSurfaceName: null,
        attemptedTargetNames: [],
        mountedSurfaceNames: [CHAT_SURFACE],
      }),
    ).toBeNull();
  });

  it("is actually mounted beside the composer, not merely written", () => {
    // The notice is worthless unless the shared conversation column renders it.
    // A unit test on the presenter cannot see that, so the mount is asserted
    // against the source of the ONE component every conversation view uses.
    const column = readFileSync(
      join(
        __dirname,
        "../../../agents/components/shared/AgentConversationColumn.tsx",
      ),
      "utf8",
    );
    expect(column).toContain("ConversationSurfaceWriteReachNotice");
  });
});
