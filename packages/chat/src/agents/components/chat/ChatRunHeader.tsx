"use client";

// ChatRunHeader — chat controls injected into the app shell header center slot
// (#shell-header-center) via <PageHeader>, exactly like AgentRunHeader does for
// the run route. A COMPACT agent picker (never full-width). Self-contained:
// the page passes the route's active agent; the live name comes from Redux.

import { useRouter } from "../../../host/navigation";
import { useAppSelector, useAppStore } from "../../../store/hooks";
import { selectAgentName } from "../../redux/agent-definition/selectors";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { ActiveContextLensChip } from "../../../context/sources/scopes";
import { ComposerModeSwitch } from "../inputs/smart-input/composer/ComposerModeSwitch";
import type { ComposerMode } from "../inputs/smart-input/composer/composer-types";
import { ConversationRecordsChip } from "./ConversationRecordsChip";
import { ConversationAttachmentsChip } from "./ConversationAttachmentsChip";
import { ConversationRoomNotice } from "./ConversationRoomNotice";
import { ConversationPageMenu } from "./ConversationPageMenu";
import {
  interceptChatAgentLink,
  stageChatAgentSwitch,
} from "./begin-fresh-chat";
import { RouteHeader } from "../../../host/chrome";

interface ChatRunHeaderProps {
  /**
   * The agent that owns this route: the URL agent on `/chat/a/[agentId]`, the
   * conversation's initiating agent on `/chat/[conversationId]`, or the default
   * on `/chat/new`. Drives the picker label.
   */
  activeAgentId?: string;
  /** SSR-resolved name for first paint; replaced by the live Redux value. */
  initialAgentName?: string;
  /** Active conversation (present on `/chat/[conversationId]`): its records,
   *  attachments and page menu. The shell's canvas offers its documents. */
  conversationId?: string;
  /**
   * Where picking an agent navigates. Defaults to the text chat route
   * (`/chat/a/<id>`). A sibling chat route that is still a chat — same picker,
   * same draft carry-over, different mode — passes its own builder so
   * switching agents keeps the user in the mode they chose. Without this the
   * picker silently drops them back into text mid-conversation.
   */
  buildAgentHref?: (agentId: string) => string;
  /**
   * The three-mode composer is on this route (composer/FEATURE.md): the top bar
   * carries Chat · Work · Advanced, centered (a PAGE mode), and the agent
   * picker + scope chip move into the composer's pills. Absent = today's
   * picker + lens chip (voice, talk and other routes without the composer).
   */
  composerMode?: { initialMode: ComposerMode | null };
}

const defaultAgentHref = (agentId: string) =>
  `/chat/a/${encodeURIComponent(agentId)}`;

export function ChatRunHeader({
  activeAgentId,
  initialAgentName,
  conversationId,
  buildAgentHref = defaultAgentHref,
  composerMode,
}: ChatRunHeaderProps) {
  const router = useRouter();
  const store = useAppStore();
  const liveName = useAppSelector((state) =>
    activeAgentId ? selectAgentName(state, activeAgentId) : undefined,
  );
  const label =
    liveName?.trim() || initialAgentName?.trim() || "Select an agent";

  const handleAgentSelect = (id: string) => {
    if (id === activeAgentId) return;
    stageChatAgentSwitch({
      dispatch: store.dispatch,
      router,
      getState: store.getState,
      targetAgentId: id,
      sourceAgentId: activeAgentId,
      sourceConversationId: conversationId,
      href: buildAgentHref(id),
    });
  };

  const interceptAgentLinks = (event: React.MouseEvent<HTMLElement>) =>
    interceptChatAgentLink(event, {
      dispatch: store.dispatch,
      router,
      getState: store.getState,
      sourceAgentId: activeAgentId,
      sourceConversationId: conversationId,
    });

  // ON THE SHARED ROUTE HEADER (2026-10-03). This row used to be a hand-built
  // flex row whose right side could only squeeze, and whose mode switch picked
  // its compact form by viewport breakpoint. With the canvas open (1440px
  // window, 640px canvas → ~800px main column) the switch drew over Records /
  // Attached / the page menu and ran under the shell's Search: seven
  // overlapping pairs, and the shell's crowding guard logged OVERDRAWN.
  // RouteHeader measures the MAIN COLUMN: actions fold into "…" (lowest
  // priority first; the page menu stays), the switch collapses to its one-
  // button form and leaves the true center when it must (useCenterControlFit),
  // and on a phone the actions move into the shell's ⋮ sheet.
  const actions = (
    <>
      {/* "Personal — only you can see this, even inside a shared room"
          (DD-171, 2026-09-12). Renders for the OWNER and only when the
          conversation really does sit inside a room other people can reach. */}
      <ConversationRoomNotice conversationId={conversationId} />
      {/* What this chat PRODUCED — the reverse view of the record chrome drawn
          under a kind block. Only an existing conversation can have produced
          anything, so `/chat/new` shows nothing. */}
      {conversationId && <ConversationRecordsChip conversationId={conversationId} />}
      {/* WHAT this chat is pointed at — repositories, files and sheets riding
          it (Arman, 2026-09-15). Silent until something is attached. */}
      {conversationId && <ConversationAttachmentsChip conversationId={conversationId} />}
      {/* DD-179 — the conversation's own menu. Absent on `/chat/new`. */}
      {conversationId && (
        <ConversationPageMenu conversationId={conversationId} href={`/chat/${conversationId}`} />
      )}
    </>
  );

  if (composerMode) {
    return (
      <RouteHeader
        center={<ComposerModeSwitch initialMode={composerMode.initialMode} />}
        // The mode switch is the chat's primary control: on a phone it stays
        // in the row as its one-button form, never inside the ⋮ sheet.
        centerOnPhone="row"
        right={actions}
      />
    );
  }

  return (
    <RouteHeader
      left={
        <div
          className="flex min-w-0 items-center gap-1 overflow-hidden"
          onClickCapture={interceptAgentLinks}
        >
          <div data-chat-agent-picker-trigger className="flex min-w-0 items-center">
            <AgentListDropdown
              onSelect={handleAgentSelect}
              label={label}
              activeAgentId={activeAgentId}
              compact
              noBorder
            />
          </div>
          {/* Working context — Lens Chip → ActiveContextTree. Sets
              appContextSlice; Clear lives in the tree footer. */}
          <ActiveContextLensChip conversationId={conversationId} className="min-w-0" />
        </div>
      }
      right={actions}
    />
  );
}
