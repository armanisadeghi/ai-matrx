# READ FIRST: How Code Gets Written Here

This codebase is built from a small set of shared primitives. Your job is almost never to
create something new — it is to find what exists, extend it if needed, and compose it.
Duplicating a concept that already exists is treated as a defect, even if your code works.

## The Ladder: Reuse → Extend → Compose → Create

For every function, component, hook, service, module, or table, you must exhaust each rung
before moving to the next:

1. **REUSE** — Something here already does this. Use it as-is.
2. **EXTEND** — Something here *almost* does this. Improve it in place so it serves both its
   existing callers and your new need. Never fork it, copy-paste it, or write a parallel
   version "just for this case." If extending it requires refactoring the core, do the
   refactor — that is the job.
3. **COMPOSE** — Existing primitives can be combined to do this. Write the thin composition,
   not a new implementation.
4. **CREATE** — Only when 1–3 genuinely fail. Anything you create must itself be a primitive:
   importable, documented, and placed in the shared location where the next person (or agent)
   will find it — not buried next to your call site.

## Mandatory Search Gate (before writing any new code)

You may not write a new implementation until you have actually searched. Minimum effort:

- Grep for the concept **and its synonyms** (e.g., `notify|alert|message|toast`,
  `retry|backoff|attempt`, `validate|check|verify|sanitize`).
- Read the shared directories (see the Primitives Index below) — not just files your task mentions.
- For any data change: read the existing schema/models/migrations **in full for the relevant
  domain** before proposing anything new.
- In your summary/PR, **state what you searched for, what you found, and what you reused or
  extended.** "I searched and found nothing" must name the queries you ran. If you cannot
  name them, you didn't search.

## Database Rules (non-negotiable)

- **A new table is an exceptional event.** New tables and schemas require explicit
  justification: name the existing tables you considered and why each was wrong.
- Same entity, new variant or state → a column, flag, enum value, or JSONB field on the
  existing table. A "scheduled" version of an existing thing, a new "type" of an existing
  thing, extra metadata on an existing thing — these are columns, not tables.
- A new table is justified only for a genuinely new entity with its own identity and
  lifecycle (its own create/update/delete story, its own foreign keys pointing at it).
- Never create a parallel table that overlaps an existing one because modifying the existing
  one felt risky. Migrations on existing tables are normal work here.

## Write Importable Code (even for code used once — for now)

We do not ask you to speculate about future callers. We ask you to write code that has
**zero extra cost to reuse** when a future caller appears:

- **Pure core, thin shell.** Business logic lives in pure functions that take inputs and
  return outputs. I/O, framework glue, and side effects stay at the edges.
- **No smuggled context.** Don't reach into globals, request objects, env vars, or the
  current page's state from deep inside logic. Pass dependencies and config as parameters.
- **No hardcoded call-site assumptions.** Names, copy, IDs, URLs, table names, and magic
  values are parameters or constants — not literals buried mid-function.
- **One responsibility per unit.** A function that fetches, transforms, and renders can be
  reused nowhere. Three functions that each do one of those can be reused everywhere.
- **Export deliberately.** Shared code lives in the shared location with a clear named
  export and a docstring/JSDoc stating what it does and its contract. Colocate only true
  one-offs (and be suspicious that it's truly a one-off).

## The Counterweight: No Speculative Abstraction

Reuse-first does not mean abstraction-everywhere. Both of these are slop:

- Copying an existing implementation because extending it was inconvenient. ❌
- Wrapping simple code in layers of configuration for callers that don't exist. ❌

Do not add options, generic type gymnastics, plugin systems, or "flexibility" no current
caller needs. Write the simplest importable version. If a genuinely different second use
appears later, *that* is when the abstraction gets designed — from two real examples, not
one imagined one. When forced to choose between a wrong abstraction and momentary
duplication, flag it and ask; never silently shoehorn a new concept into a primitive it
doesn't fit.

## Definition of Done — self-review before you finish

Answer these honestly in your summary:

1. What did I search for, and what did I find?
2. What existing code did I reuse or extend? What did I create, and why was creation the
   only option?
3. Could another feature import every new function/component I wrote, as-is, without
   modification? If not, why is it entangled with its call site?
4. Did I add any table, schema, file, helper, or pattern that duplicates a concept that
   already exists anywhere in this codebase?

If you shipped a second implementation of something we already own, the task is not done —
delete yours and extend ours.

## Primitives Index

<!-- Keep this current. Agents cannot reuse what they cannot find.
     Guarded: `pnpm check:reuse-index` fails (:strict) on any path that no longer exists.
     First batch = high-reuse platform primitives only.
     Skip: shadcn/ui (`components/ui/*`), `cn`, Redux hooks, Supabase clients.
     Format: Need → Use → Location -->

### Components — inputs & text

| If you need to… | Use | Located at |
| --- | --- | --- |
| Long-form text input (voice, stats, agent hooks) | `ProTextarea` | `components/official/ProTextarea.tsx` |
| Single-line labeled input | `ProInput` | `components/official/ProInput.tsx` |
| Agent chat / run input (all surfaces) | `SmartAgentInput` | `features/agents/components/inputs/smart-input/SmartAgentInput.tsx` |
| Compact active-context picker (popover/menu) | `ActiveContextTree` (+ `ContextTree`) | `features/scopes/components/active-context/ActiveContextTree.tsx` |
| Overflow / hierarchical action menu | `AdvancedMenu` | `components/official/AdvancedMenu.tsx` |
| Resolve Lucide / custom icon by name | `IconResolver` | `components/official/icons/IconResolver.tsx` |
| 44×44 icon tap targets | `TapTargetButton` + `tap-buttons` | `components/icons/TapTargetButton.tsx`, `components/icons/tap-buttons.tsx` |

### Components — markdown & content

| If you need to… | Use | Located at |
| --- | --- | --- |
| Render streaming or static markdown | `MarkdownStream` | `components/MarkdownStream.tsx` |
| Lightweight non-streaming markdown | `BasicMarkdownContent` | `components/mardown-display/chat-markdown/BasicMarkdownContent.tsx` |
| Document shell with actions + context menu | `RichDocument` | `features/rich-document/RichDocument.tsx` |
| Floating content action rail (copy, TTS, export…) | `ContentActionBar` | `components/content-actions/ContentActionBar.tsx` |
| Inspect / edit large JSON | `JsonInspector` | `components/official-candidate/json-inspector/JsonInspector.tsx` |

### Components — chat & messages

| If you need to… | Use | Located at |
| --- | --- | --- |
| Full agent conversation column | `AgentConversationColumn` | `features/agents/components/shared/AgentConversationColumn.tsx` |
| Assistant message turn | `AgentAssistantMessage` | `features/agents/components/messages-display/assistant/AgentAssistantMessage.tsx` |
| User message turn | `AgentUserMessage` | `features/agents/components/messages-display/user/AgentUserMessage.tsx` |
| Per-message ⋮ actions | `MessageOptionsMenu` (+ registry) | `features/agents/components/messages-display/message-options/` |
| TTS play control on content | `SpeakerButton` / `SpeakerGroup` | `features/tts/components/SpeakerButton.tsx` |

### Components — overlays, windows, dialogs

| If you need to… | Use | Located at |
| --- | --- | --- |
| Draggable / resizable window frame | `WindowPanel` | `features/window-panels/WindowPanel.tsx` — see `features/window-panels/FEATURE.md` |
| Open any overlay / window / modal | typed opener, else `openOverlay` | `features/overlays/openers/*`, `lib/redux/thunks/overlayThunks.ts` — see `features/overlays/FEATURE.md` |
| Full-viewport overlay shell | `FullScreenOverlay` | `components/official/FullScreenOverlay.tsx` |
| Imperative confirm (replaces `window.confirm`) | `confirm({…})` | `components/dialogs/confirm/ConfirmDialogHost.tsx` |
| Inline destructive confirm | `ConfirmDialog` | `components/ui/confirm-dialog.tsx` |
| Single-string prompt (replaces `window.prompt`) | `TextInputDialog` | `components/dialogs/text-input/TextInputDialog.tsx` |

### Components — files, media, layout

| If you need to… | Use | Located at |
| --- | --- | --- |
| Upload / normalize / resolve any file | `fileHandler` | `features/files/handler/handler.ts` — see `features/files/handler/FEATURE.md` |
| Render owned media (self-healing URLs) | `InlineMediaRef` | `features/files/components/inline/InlineMediaRef.tsx` |
| `(core)` route header chrome | `PageHeader` | `features/shell/components/header/PageHeader.tsx` |
| Resizable workbench side/bottom panel | `MatrxDynamicPanel` | `components/matrx/resizable/MatrxDynamicPanel.tsx` |
| Settings preference controls | settings primitives + `useSetting` | `components/official/settings/primitives/*`, `features/settings/hooks/useSetting.ts` |

### Utilities

| If you need to… | Use | Located at |
| --- | --- | --- |
| Humanize labels (snake/kebab → Title Case, acronyms) | `formatText` / `formatTitleCase` | `utils/text/text-case-converter.ts` |
| Slugify to kebab-case | `convertToKebabCase` | `utils/text/stringUtils.ts` |
| Markdown → speakable plain text (TTS) | `parseMarkdownToText` | `utils/markdown-processors/parse-markdown-for-speech.ts` |
| Strip markdown to plain text | `cleanMarkdown` | `utils/markdown-processors/clean-markdown-to-text.ts` |
| Copy / strip / sanitize markdown for clipboard | markdown-copy helpers | `components/matrx/buttons/markdown-copy-utils.ts` |
| Detect expiring S3 signed URLs | `isSignedUrl` | `lib/media/signed-url.ts` |
| Alarm on non-durable media URLs | `reportMediaDurabilityViolation` | `lib/media/durability.ts` |
| Cmd/Ctrl/middle-click → new tab | `shouldOpenInNewTab` / `openInNewTab` | `utils/navigation/should-open-in-new-tab.ts` |
| Toast success / error / info | `toast` from `sonner` | (package) — never `window.alert` |

### Hooks

| If you need to… | Use | Located at |
| --- | --- | --- |
| Detect mobile (Drawer vs Dialog, stack vs tabs) | `useIsMobile` | `hooks/use-mobile.tsx` |
| Call Python backend from client (auth + URL) | `useBackendApi` | `hooks/useBackendApi.ts` |
| Auth headers for Next.js `/api/*` routes | `useApiAuth` | `hooks/useApiAuth.ts` |
| Resolve durable media `src` from `file_id` | `useFileSrc` | `features/files/handler/hooks/useFileSrc.ts` |
| Read / write a catalogue preference | `useSetting` | `features/settings/hooks/useSetting.ts` |

### Systems (extend these — never fork)

| System | Entry | Doc |
| --- | --- | --- |
| Overlay catalogue + openers | `features/overlays/` | `features/overlays/FEATURE.md` + `overlay-system` skill |
| Window panels + tray | `features/window-panels/` | `features/window-panels/FEATURE.md` + `window-panels` skill |
| Universal files | `features/files/handler/` | `features/files/handler/FEATURE.md` |
| Message / content action registries | `messageActionRegistry`, `contentActionRegistry` | extend the registry; don't build a parallel menu |
| Scopes / context assignment | `features/scopes/` | `features/scopes/FEATURE.md` — Surface A vs B invariant |
| Settings catalogue | `features/settings/` | `features/settings/FEATURE.md` + `settings-system` skill |
