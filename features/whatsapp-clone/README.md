# WhatsApp Clone

Pixel-faithful WhatsApp desktop UI built fresh for AI Matrx.

**Demo:** [/demos/whatsapp-demo](http://localhost:3000/demos/whatsapp-demo)

## Layout

```
features/whatsapp-clone/
├── shell/                  # window chrome, traffic-light bar, icon rail, pane divider
├── conversation-list/      # left pane: search, filter chips, rows
├── chat-view/              # right pane: header, doodle background, bubbles, input
│   └── bubbles/            # text, image, video, audio, file, system
├── modals/
│   ├── ModalShell.tsx      # GENERIC two-pane modal w/ push-nav (reusable)
│   ├── settings/           # Settings modal — uses ModalShell
│   └── media/
│       ├── TabbedGalleryModal.tsx  # GENERIC tabbed gallery (reusable)
│       └── MediaModal.tsx           # Media/Links/Docs — uses TabbedGalleryModal
├── shared/                 # WAAvatar, UnreadBadge, PresenceLabel, time helpers
├── hooks/                  # data hooks with mock/live branch
└── mock-data/              # curated demo content
```

## Data flow

Three hooks own the mock/live branch — components are agnostic.

| Hook | Returns |
|---|---|
| `useWhatsAppConversations()` | `{ conversations, selectedId, select, isLoading }` |
| `useWhatsAppChat(convId)` | `{ messages, sendMessage, typingText, ... }` |
| `useWhatsAppMedia()` | `{ media, links, docs }` (full library, not per-chat) |

`<WhatsAppDataModeProvider mode="mock"|"live">` wraps the shell. `?mock=0` flips to live; default is mock.

**Live mode** wires to `features/messaging/` (Supabase `dm_*` tables, `MessagingService`). **Mock mode** serves `mock-data/`.

## Reusable modals

`ModalShell` and `TabbedGalleryModal` are templates for other parts of the app:

```tsx
<ModalShell
  open
  onOpenChange={...}
  title="Settings"
  navItems={[
    { id: "account", label: "Account", icon: KeyRound, panel: <AccountPanel /> },
    { id: "privacy", label: "Privacy", icon: Lock, panel: <PrivacyPanel /> },
    // ...
  ]}
  initialNavId="account"
  footer={{ primaryLabel: "Done" }}
/>

<TabbedGalleryModal
  open
  onOpenChange={...}
  title="Media"
  tabs={[
    { id: "media", label: "Media", count: 19, content: <MediaTab items={media} /> },
    { id: "links", label: "Links", count: 8, content: <LinksTab items={links} /> },
    // ...
  ]}
  toolbarSlot={<GalleryToolbar />}
  footer={{ primaryLabel: "Done" }}
/>
```

## Audio / video — visual stubs

Affordances render fully; handlers default to no-op for the future patch.

| Surface | Component | Stub prop |
|---|---|---|
| Voice / video call | `chat-view/ChatHeaderActions.tsx` | `onCallVoice`, `onCallVideo` |
| Mic record | `chat-view/MessageInputBar.tsx` | `onRecordStart`, `onRecordStop` |
| Audio bubble | `chat-view/bubbles/AudioBubble.tsx` | playback handler |
| Video bubble | `chat-view/bubbles/VideoBubble.tsx` | tap-to-play handler |
| Camera attach | `chat-view/MessageInputAttachMenu.tsx` | `onSelect("camera")` |

## Out of scope (for later)

Real call screens, voice-message recording, status pane, channels, communities, in-chat search results, disappearing-messages timer, drag-to-reorder, real link unfurling.
