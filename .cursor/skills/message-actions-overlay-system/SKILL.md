# Message Actions Overlay System

## Overview

This skill describes the consolidated overlay architecture for AI Matrx Admin. All overlays — whether triggered from a message action menu, a sidebar, the app header, an SSR route, or a public route — dispatch to a single Redux slice (`overlaySlice`) and render through a single controller (`OverlayController`).

---

## Architecture

```
All Route Providers (authenticated + public + SSR)
  └── ClientOverlayProvider
        └── OverlayController
              ├── reads overlaySlice (open/close + data)
              └── dynamically renders all overlay components

Any component anywhere in the app:
  dispatch(openShareModal({ ... }))    →  overlaySlice  →  OverlayController  →  ShareModal
  dispatch(openHtmlPreview({ ... }))   →  overlaySlice  →  OverlayController  →  HtmlPreviewBridge
  dispatch(openSaveToNotes({ ... }))   →  overlaySlice  →  OverlayController  →  QuickSaveModal
  dispatch(openFeedbackDialog())        →  overlaySlice  →  OverlayController  →  FeedbackDialog
  ... etc

messageActionsSlice: instance tracking only (NO overlay state)
  - registerInstance / unregisterInstance / updateInstanceContext
  - AssistantActionBar registers its message context (content, sessionId, messageId) on mount
```

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/redux/slices/overlaySlice.ts` | Open/close state + typed action creators for all overlays |
| `lib/redux/slices/overlayDataSlice.ts` | Dynamic key-value store for complex overlay state (e.g. htmlPreview data) |
| `components/overlays/OverlayController.tsx` | Single renderer — dynamic imports + conditional rendering for all overlays |
| `components/overlays/ClientOverlayProvider.tsx` | Thin wrapper that mounts OverlayController |
| `features/cx-conversation/redux/messageActionsSlice.ts` | Instance tracking ONLY (no overlay open/close) |
| `features/cx-conversation/actions/messageActionRegistry.ts` | Menu item registry — all dispatches via overlaySlice typed creators |
| `features/cx-conversation/AssistantActionBar.tsx` | Registers message instances + dispatches overlay opens via overlaySlice |

---

## overlaySlice — Typed Action Creators

All overlay opens are dispatched via typed creators exported from `overlaySlice`:

```typescript
import {
  openFullScreenEditor,    // fullScreenEditor overlay
  openHtmlPreview,         // htmlPreview overlay
  openSaveToNotes,         // saveToNotes overlay
  openEmailDialog,         // emailDialog overlay
  openAuthGate,            // authGate overlay
  openFeedbackDialog,      // feedbackDialog overlay
  openShareModal,          // shareModal overlay
  openAnnouncements,       // announcements overlay
  openUserPreferences,     // userPreferences overlay
  openQuickNotes,          // quickNotes overlay
  openQuickTasks,          // quickTasks overlay
  closeOverlay,            // close any overlay by id
} from '@/lib/redux/slices/overlaySlice';
```

### Example: Trigger share from any component

```typescript
import { useAppDispatch } from '@/lib/redux/hooks';
import { openShareModal } from '@/lib/redux/slices/overlaySlice';

function MyComponent() {
  const dispatch = useAppDispatch();

  return (
    <button onClick={() => dispatch(openShareModal({
      resourceType: 'cx_conversation',
      resourceId: conversationId,
      resourceName: title,
      isOwner: true,
    }))}>
      Share
    </button>
  );
}
```

### Example: HTML preview from a public message component

```typescript
dispatch(openHtmlPreview({ content: message.content }));
```

### Example: Auth gate for unauthenticated feature access

```typescript
dispatch(openAuthGate({ featureName: 'Save to Notes', featureDescription: 'Sign in to save notes.' }));
```

---

## overlayDataSlice — Complex Overlay State

For overlays that need mutable, structured state (beyond a one-time `data` blob in `overlaySlice`), use `overlayDataSlice`:

```typescript
import { setOverlayData, selectTypedOverlayData } from '@/lib/redux/slices/overlayDataSlice';

// Store typed data
dispatch(setOverlayData({ overlayId: 'htmlPreview', type: 'htmlPreview', data: { markdown, css } }));

// Read with type guard
const data = useAppSelector(state => selectTypedOverlayData<HtmlPreviewData>(state, 'htmlPreview', 'htmlPreview'));
```

---

## Adding a New Overlay

1. **Add overlay ID to `overlaySlice` initialState:**

```typescript
myNewOverlay: { isOpen: false, data: null },
```

2. **Add typed creator in `overlaySlice`:**

```typescript
export const openMyNewOverlay = (options: MyPayload) =>
  openOverlay({ overlayId: 'myNewOverlay', data: options });
```

3. **Add dynamic import + renderer to `OverlayController`:**

```typescript
const MyNewOverlayComponent = dynamic(
  () => import('@/features/my-feature/MyNewOverlay').then(m => ({ default: m.MyNewOverlay })),
  { ssr: false }
);

// In the component body:
const isMyNewOverlayOpen = useAppSelector(state => selectIsOverlayOpen(state, 'myNewOverlay'));
const myNewOverlayData = useAppSelector(state => selectOverlayData(state, 'myNewOverlay'));

// In JSX:
{isMyNewOverlayOpen && myNewOverlayData && (
  <MyNewOverlayComponent
    isOpen={true}
    onClose={() => dispatch(closeOverlay({ overlayId: 'myNewOverlay' }))}
    {...myNewOverlayData as MyPayload}
  />
)}
```

4. **Dispatch from anywhere:**

```typescript
dispatch(openMyNewOverlay({ ...options }));
```

No prop drilling. No duplicate renders. No conditional availability per route.

---

## Route Availability

`ClientOverlayProvider` is mounted in **every route provider**:

| Route type | Provider file |
|-----------|--------------|
| Authenticated routes | `app/Providers.tsx` |
| Public routes (`/p/...`) | `app/(public)/PublicProviders.tsx` |
| SSR routes (`/ssr/...`) | `app/(dev)/layout.dev.tsx` (via `app/Providers.tsx`) |

---

## messageActionsSlice — Instance Tracking Only

`messageActionsSlice` is now a pure instance registry. It no longer has any overlay-related state.

```typescript
// Register on mount
dispatch(messageActionsActions.registerInstance({ id: instanceId, context: { content, messageId, sessionId, ... } }));

// Update on content change
dispatch(messageActionsActions.updateInstanceContext({ id: instanceId, updates: { content } }));

// Unregister on unmount
dispatch(messageActionsActions.unregisterInstance(instanceId));
```

The reason for maintaining this: the message action registry (`getMessageActions`) receives `content`, `sessionId`, and `messageId` directly from the `AssistantActionBar` props — not from Redux. The slice is a lightweight registry in case any overlay needs to look up which message context belongs to which bar, but overlay rendering itself always goes through `overlaySlice`.

---

## What Was Eliminated

- ❌ `MessageActionsController.tsx` — deleted; it was a parallel overlay renderer that duplicated `OverlayController`
- ❌ `openOverlay` / `closeOverlay` / `openOverlays` actions from `messageActionsSlice`
- ❌ Inline `<HtmlPreviewModal>` in `features/public-chat/components/MessageDisplay.tsx`
- ❌ Inline `<ShareModal>` in `features/public-chat/components/ChatContainer.tsx`
- ❌ Inline `<ShareModal>` in `features/public-chat/components/sidebar/SidebarChats.tsx`
- ❌ `isShareOpen` and similar local `useState` flags for overlay control
- ❌ Overlay components missing from public routes due to provider gaps
