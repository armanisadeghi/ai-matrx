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

|                                |                                                                                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The one provider mount         | [`providers/MessagingHost.tsx`](../../providers/MessagingHost.tsx) — inside `RealtimeHost`, so messaging rides the app's single realtime manager                                   |
| The two surfaces               | `components/ConversationListPane.tsx`, `components/ConversationPane.tsx` — the package's list and thread inside this app's v3 right-click menu and surface scope                   |
| App chrome the package renders | `components/MessagingChrome.tsx` — the `data-message-id` / `data-conversation-id` the menu resolves its target from, and this app's ```matrx fence renderer                        |
| Action cards                   | `actions/messageActionSurfaces.tsx` — this app's kinds (access request, resource shared, task reminder, agent drift, open link, setting request), handed over as `actionRenderers` |
| Notifications                  | `lib/useIncomingMessageNotifier.ts` — sound + desktop notification, gated on this app's user preferences                                                                           |
| Chrome state                   | `redux/messagingUiSlice.ts` — the side sheet's open state and dragged width. **Nothing else.**                                                                                     |
| "Message this person"          | `service/sendDirectActionMessage.ts` — the framework-free package path, for services with no React                                                                                 |
| Menus                          | `lib/messaging-menu-actions.tsx`                                                                                                                                                   |

The package's `tokens.css` and `styles.css` are imported once in `app/layout.tsx`;
`app/globals.css` maps the messaging palette onto this app's semantic theme
tokens. Omitting the structural sheet is not cosmetic: avatars, groups,
metadata, scrolling, and the composer all collapse into raw document flow.

## The rules that hold this together

1. **Never mirror package state into Redux.** Conversations, unread counts and the active
   conversation come from `useConversations()` / `useMessagingSnapshot()`. A copy in Redux drifts
   the moment a message arrives mid-write, and the deleted slice is exactly what that looked like.
2. **Never re-render a message.** A new messaging surface composes `ConversationListPane` /
   `ConversationPane`, or the package's own components. A second bubble renderer is the failure
   the package exists to prevent.
3. 🚨 **A fix that belongs in the package is made IN the package** (`aidream/apps/shared/messaging`),
   and adopted here from the registry; dedicated release agents own publication. The adoption
   session made nine such fixes; the handoff lists every one.
4. **One realtime manager.** `MessagingHost` sits under `RealtimeHost` and the package detects it.
   Do not mount a second `RealtimeProvider` anywhere.
5. **Embedded workspaces keep one owner for each layer.** `ConversationPane`
   may hide the package header/AI bar and inject `ProTextarea` through
   `renderComposerInput`, but the package still owns the draft, reply target,
   typing lease, Enter-key contract, and send. Never rebuild those behaviors in
   the host to get app-native textarea chrome.

## The four AI actions — wired to Mandates (2026-09-07)

Catch me up · Summarize · Action items · Draft a reply. Their identity comes from the **Mandate**
system, never from a config line and never from a UUID in this repo.

|                           |                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The four jobs, named once | [`lib/messagingMandates.ts`](./lib/messagingMandates.ts) — the capability→mandate map, the product sentences, and the knob address. **Two readers, one list**: the surface manifest (disclosure) and the provider hook (runtime), so the Agents menu and the thing that actually runs can never name different jobs. |
| Identity injection        | [`lib/useMessagingIntelligences.ts`](./lib/useMessagingIntelligences.ts) — `useMandateSet` over the four keys, plus the org/user knob. Injects the resolved Holder **and** its `config_overrides`; passing the agent id alone would drop the settings half of the winning binding.                                   |
| The mount                 | [`providers/MessagingHost.tsx`](../../providers/MessagingHost.tsx) — transport, `agents`, `maxTranscriptMessages`, and the registered producer slugs `matrx-frontend` / `messages`.                                                                                                                                  |
| Disclosure                | [`features/surfaces/manifests/messages.manifest.ts`](../surfaces/manifests/messages.manifest.ts) — four `agentRoles`, each carrying a `mandateKey` and a NULL `defaultAgentId`. They appear in the shell's top Agents menu and add **nothing** to the page. Guarded by `manifests/messages-agent-roles.test.ts`.     |
| The one knob              | `platform.feature_knob` → `messaging.conversation_ai.transcript_message_cap` (default 200, org- and user-overridable). The package's hardcoded 200 was a behavioural opinion; it is now a row.                                                                                                                       |

Server side: the four mandates and their shared Provision (`messaging.conversation`) are declared
in aidream `services/mandates/client_mandates.py`. Rebind them per organization or per user at
`/mandates?feature=messaging` — no deploy.

🚨 **A job with no Holder is ABSENT, never a dead button.** An unresolved mandate leaves its
capability out of the identity map and the package renders no chip for it, with a loud console
error carrying the remedy. **As of 2026-09-11 all four resolve and answer live** (four chips at
`/messages/<id>`, "Catch me up" returned a real answer; the run found the squeezed-answer
stylesheet defect, released as messaging 0.11.2). *History — 2026-09-07, all four were unresolved*: the four Holder agents
could not be authored because the platform's agent-authoring door
(`agent_factory.structure_builder`) is pinned to `claude-opus-5` with `model_tiers` NULL and the
Anthropic account is out of credit. The four mandates are declared and recorded as
`mandate_unprovisioned` findings; binding a Holder turns the AI bar on with no deploy. The agent
specifications to build are in the cross-repo handoff.

## What this app deliberately does not have yet

- **Reactions, per-message read receipts and edit history** remain unsupported. Conversation pins use the platform favorites service; files use the existing Resource Picker and authenticated media pipeline.

## Not messaging, but next door

`lib/extension-bridge/bridgeChannel.ts` came out of the deleted `lib/supabase/messaging.ts`. It
is the Chrome extension's transport, it is the one hand-rolled Supabase channel left in this
area, and its own header says why it is not on `@ai-matrx/realtime` yet.

## macOS presentation and review catalogue (2026-09-30)

`messages-native.css` is the shared app presentation used by both panes, including
floating windows and the side sheet. It sets compact desktop typography, a
single-line action strip, a centered glass contact header and a 36px growing composer;
touch inputs retain 16px text and 44px action targets. Package data and rendering
ownership are unchanged.

`/messages-showcase` renders the package's real `MessageBubble` against the
synthetic catalogue in `demo/examples.ts`, including all registered host action
kinds and meet invitations. It provides light/dark, incoming/outgoing and two
contact-header previews. Bubble action clicks are intercepted before handlers
run; the explicit real-conversation/window links are outside that boundary.
Attachment payloads render through the host `MessagingAttachment` port; the catalogue uses synthetic local media. Quoted replies resolve their loaded parent or show an explicit earlier-message label.

`useMessagePins` stores `dm_conversation` pins through the platform favorites service. The package places the three most recently active pins in circular tiles, further pins above ordinary rows, and loads older inbox pages to find pinned conversations. Right-click and the thread header both toggle the same pins.

`MessagesComposerInput` keeps the package in charge of drafts, additions, replies and sending. Text and attachments survive view changes and reloads through the package’s per-user session draft store. The plus menu uses the existing file picker, canonical reference picker, and custom table-row picker; emoji insert at the saved caret. The app does not create a second message or outbox path.

The shared Assists clearance pass must never inset editable fields: doing so
changes textarea auto-grow measurements. `clearance-preserves-editable-fields.test.ts`
proves that textareas, editable elements and textbox roles retain their padding
while their containing page can still receive dock clearance.
