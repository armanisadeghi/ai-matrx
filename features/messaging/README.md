# Messaging — this app's frame around `@ai-matrx/messaging`

Cross-repo system of record:
`/Users/armanisadeghi/code/common-docs/systems/communications/messaging/HANDOFF.md` — read it
before touching messaging in ANY repo.

**Since 2026-09-07 this feature owns no messaging logic.** Conversations, messages, realtime,
presence, typing, the outbox, references and actionable messages are `@ai-matrx/messaging`'s.
The app's own implementation — `lib/supabase/messaging.ts`, `hooks/useSupabaseMessaging.ts`,
`redux/messagingSlice.ts`, the `data/` caches, and the ConversationList / ChatThread /
MessageBubble / MessageInput / MessagingInitializer / TypingIndicator / OnlineIndicator
components — was DELETED, not wrapped. Roughly 5,900 lines.

## Where things are

| | |
|---|---|
| The one provider mount | [`providers/MessagingHost.tsx`](../../providers/MessagingHost.tsx) — inside `RealtimeHost`, so messaging rides the app's single realtime manager |
| The two surfaces | `components/ConversationListPane.tsx`, `components/ConversationPane.tsx` — the package's list and thread inside this app's v3 right-click menu and surface scope |
| App chrome the package renders | `components/MessagingChrome.tsx` — the `data-message-id` / `data-conversation-id` the menu resolves its target from, and this app's ```matrx fence renderer |
| Action cards | `actions/messageActionSurfaces.tsx` — this app's kinds (access request, resource shared, task reminder, agent drift, open link, setting request), handed over as `actionRenderers` |
| Notifications | `lib/useIncomingMessageNotifier.ts` — sound + desktop notification, gated on this app's user preferences |
| Chrome state | `redux/messagingUiSlice.ts` — the side sheet's open state and dragged width. **Nothing else.** |
| "Message this person" | `service/sendDirectActionMessage.ts` — the framework-free package path, for services with no React |
| Menus | `lib/messaging-menu-actions.tsx` |

## The rules that hold this together

1. **Never mirror package state into Redux.** Conversations, unread counts and the active
   conversation come from `useConversations()` / `useMessagingSnapshot()`. A copy in Redux drifts
   the moment a message arrives mid-write, and the deleted slice is exactly what that looked like.
2. **Never re-render a message.** A new messaging surface composes `ConversationListPane` /
   `ConversationPane`, or the package's own components. A second bubble renderer is the failure
   the package exists to prevent.
3. 🚨 **A fix that belongs in the package is made IN the package** (`aidream/apps/shared/messaging`),
   released, and adopted here in the same session — never massaged in this folder. The adoption
   session made nine such fixes; the handoff lists every one.
4. **One realtime manager.** `MessagingHost` sits under `RealtimeHost` and the package detects it.
   Do not mount a second `RealtimeProvider` anywhere.

## What this app deliberately does not have yet

- **The four AI actions** (catch me up, summarize, action items, draft a reply) render NOTHING,
  because the provider is passed no `transport`/`agents`. Their agent ids must come from
  **Mandates** — never a hardcoded UUID — so wiring them is Mandate work, not a config line. An
  absent action is the honest state; a dead button would not be.
- **Reactions, per-message read receipts, edit history, pinning, attachment upload** — the
  canonical `communication.dm_*` schema has no columns for the first four, and upload belongs on
  `@ai-matrx/data/files`. This app never had them either.

## Not messaging, but next door

`lib/extension-bridge/bridgeChannel.ts` came out of the deleted `lib/supabase/messaging.ts`. It
is the Chrome extension's transport, it is the one hand-rolled Supabase channel left in this
area, and its own header says why it is not on `@ai-matrx/realtime` yet.
