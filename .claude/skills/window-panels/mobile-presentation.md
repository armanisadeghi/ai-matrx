# Window Panels — mobile presentation

Companion to the `window-panels` skill. Read when the task involves how a window renders on mobile (`mobilePresentation`).

## Mobile presentation

On mobile, `WindowPanel` routes by the overlay's `mobilePresentation` (from `getStaticEntryByOverlayId`; default `"fullscreen"`):

| Value | Rendered as | When |
|---|---|---|
| `"fullscreen"` | Full-viewport takeover (one window at a time) | Content-dominant windows (Notes, AgentRun, News). Default. |
| `"drawer"` | Bottom-sheet (`mobile/MobileDrawerSurface.tsx`, vaul) | Forms, settings, sidebar-heavy windows. Sidebars collapse into a nested drawer (`mobileSidebarAs`, default `"drawer"`). |
| `"card"` | Floating bottom-right card (`mobile/MobileCardSurface.tsx`), non-modal | Small utility / debug surfaces. |
| `"hidden"` | Nothing (dev warning if opened) | Windows that shouldn't exist on mobile. |

Decision tree: has a sidebar → `"drawer"`; content-dominant → `"fullscreen"`; small utility/debug → `"card"`; never on mobile → `"hidden"`. Mobile rules: `h-dvh`, `pb-safe`, `--header-height`, input `font-size ≥ 16px` — see the `ios-mobile-first` skill.
