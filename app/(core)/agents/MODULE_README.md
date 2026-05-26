# `app.(a).agents` — Module Overview

> This document is partially auto-generated. Sections tagged `<!-- AUTO:id -->` are refreshed by the generator.
> Everything else is yours to edit freely and will never be overwritten.

<!-- AUTO:meta -->
## About This Document

This file is **partially auto-generated**. Sections wrapped in `<!-- AUTO:id -->` tags
are overwritten each time the generator runs. Everything else is yours to edit freely.

| Field | Value |
|-------|-------|
| Module | `app/(a)/agents` |
| Last generated | 2026-05-09 11:18 |
| Output file | `app/(a)/agents/MODULE_README.md` |
| Signature mode | `signatures` |

**To refresh auto-sections:**
```bash
python utils/code_context/generate_module_readme.py app/(a)/agents --mode signatures
```

**To add permanent notes:** Write anywhere outside the `<!-- AUTO:... -->` blocks.
<!-- /AUTO:meta -->

<!-- HUMAN-EDITABLE: This section is yours. Agents & Humans can edit this section freely — it will not be overwritten. -->

## Architecture

> **Fill this in.** Describe the execution flow and layer map for this module.
> See `utils/code_context/MODULE_README_SPEC.md` for the recommended format.
>
> Suggested structure:
>
> ### Layers
> | File | Role |
> |------|------|
> | `entry.py` | Public entry point — receives requests, returns results |
> | `engine.py` | Core dispatch logic |
> | `models.py` | Shared data types |
>
> ### Call Flow (happy path)
> ```
> entry_function() → engine.dispatch() → implementation()
> ```


<!-- AUTO:tree -->
## Directory Tree

> Auto-generated. 42 files across 24 directories.

```
app/(a)/agents/
├── MODULE_README.md
├── [id]/
│   ├── apps/
│   │   ├── page.tsx
│   ├── error.tsx
│   ├── latest/
│   │   ├── loading.tsx
│   │   ├── page.tsx
│   ├── layout.tsx
│   ├── loading.tsx
│   ├── not-found.tsx
│   ├── page.tsx
│   ├── run/
│   │   ├── loading.tsx
│   │   ├── page.tsx
│   ├── shortcuts/
│   │   ├── [shortcutId]/
│   │   │   ├── page.tsx
│   │   ├── new/
│   │   │   ├── page.tsx
│   │   ├── page.tsx
│   ├── v/
│   │   ├── [version]/
│   │   │   ├── loading.tsx
│   │   │   ├── not-found.tsx
│   │   │   ├── page.tsx
│   ├── widgets/
│   │   ├── layout.tsx
│   │   ├── loading.tsx
│   │   ├── page.tsx
├── compare/
│   ├── page.tsx
├── error.tsx
├── layout.tsx
├── loading.tsx
├── new/
│   ├── builder/
│   │   ├── customizer/
│   │   │   ├── page.tsx
│   │   ├── instant/
│   │   │   ├── page.tsx
│   │   ├── page.tsx
│   │   ├── tabs/
│   │   │   ├── page.tsx
│   ├── generate/
│   │   ├── page.tsx
│   ├── import/
│   │   ├── page.tsx
│   ├── layout.tsx
│   ├── manual/
│   │   ├── AutoSubmitForm.tsx
│   │   ├── page.tsx
│   ├── page.tsx
├── page.tsx
├── shortcuts/
│   ├── AgentShortcutsLayoutClient.tsx
│   ├── categories/
│   │   ├── page.tsx
│   ├── content-blocks/
│   │   ├── page.tsx
│   ├── edit/
│   │   ├── [id]/
│   │   │   ├── page.tsx
│   ├── layout.tsx
│   ├── page.tsx
│   ├── shortcuts/
│   │   ├── page.tsx
# excluded: 1 .md
```
<!-- /AUTO:tree -->

<!-- AUTO:signatures -->
## API Signatures

> Auto-generated via `output_mode="signatures"`. ~5-10% token cost vs full source.
> For full source, open the individual files directly.

```
---
Filepath: app/(a)/agents/layout.tsx  [typescript/react]

  # Components
    [Component] export default function AgentsLayout({ children, }: { children: React.ReactNode; })


---
Filepath: app/(a)/agents/error.tsx  [typescript/react]

  # Components
    [Component] export default function AgentsListError({ error, reset, }: { error: Error & { digest?: string }; reset: ()


---
Filepath: app/(a)/agents/loading.tsx  [typescript/react]

  # Components
    [Component] export default function AgentsListLoading()


---
Filepath: app/(a)/agents/page.tsx  [typescript/react]



---
Filepath: app/(a)/agents/new/layout.tsx  [typescript/react]

  # Components
    [Component] export default function NewAgentLayout({ children }: { children: ReactNode })


---
Filepath: app/(a)/agents/new/page.tsx  [typescript/react]

  # Components
    [Component] export default function NewAgentPage()


---
Filepath: app/(a)/agents/new/manual/AutoSubmitForm.tsx  [typescript/react]

  # Components
    [Component] export function AutoSubmitForm({ action }: AutoSubmitFormProps)
    Props: AutoSubmitFormProps
      # action: () => Promise<void>
  # Types & Interfaces
    interface AutoSubmitFormProps


---
Filepath: app/(a)/agents/new/manual/page.tsx  [typescript/react]

  # Components
    [Component] export default function NewManualAgentPage()


---
Filepath: app/(a)/agents/new/generate/page.tsx  [typescript/react]

  # Components
    [Component] export default function GenerateAgentPage()


---
Filepath: app/(a)/agents/new/import/page.tsx  [typescript/react]

  # Components
    [Component] export default function ImportAgentPage()


---
Filepath: app/(a)/agents/new/builder/page.tsx  [typescript/react]

  # Components
    [Component] export default function InteractiveBuilderPage()


---
Filepath: app/(a)/agents/new/builder/tabs/page.tsx  [typescript/react]

  # Components
    [Component] export default function TabsBuilderPage()


---
Filepath: app/(a)/agents/new/builder/instant/page.tsx  [typescript/react]

  # Components
    [Component] export default function InstantBuilderPage()


---
Filepath: app/(a)/agents/new/builder/customizer/page.tsx  [typescript/react]

  # Components
    [Component] export default function CustomizerBuilderPage()


---
Filepath: app/(a)/agents/shortcuts/layout.tsx  [typescript/react]

  # Components
    [Component] export default function UserAgentShortcutsLayout({ children, }: { children: React.ReactNode; })


---
Filepath: app/(a)/agents/shortcuts/page.tsx  [typescript/react]

  # Components
    [Component] export default function UserAgentShortcutsDashboardPage()


---
Filepath: app/(a)/agents/shortcuts/AgentShortcutsLayoutClient.tsx  [typescript/react]

  # Components
    [Component] export function AgentShortcutsLayoutClient({ children, }: { children: React.ReactNode; })


---
Filepath: app/(a)/agents/shortcuts/content-blocks/page.tsx  [typescript/react]

  # Components
    [Component] export default function UserContentBlocksPage()


---
Filepath: app/(a)/agents/shortcuts/edit/[id]/page.tsx  [typescript/react]

  # Components
    [Component] export default function UserEditShortcutPage({ params, }: { params: Promise<{ id: string }>; })


---
Filepath: app/(a)/agents/shortcuts/shortcuts/page.tsx  [typescript/react]

  # Components
    [Component] export default function UserShortcutsPage()


---
Filepath: app/(a)/agents/shortcuts/categories/page.tsx  [typescript/react]

  # Components
    [Component] export default function UserCategoriesPage()


---
Filepath: app/(a)/agents/compare/page.tsx  [typescript/react]

  # Components
    [Component] export default function CompareAgentsPage()


---
Filepath: app/(a)/agents/[id]/layout.tsx  [typescript/react]

  # Utilities
    export async function generateMetadata({ params, }: { params: Promise<{ id: string }>; })


---
Filepath: app/(a)/agents/[id]/error.tsx  [typescript/react]

  # Components
    [Component] export default function AgentError({ error, reset, }: { error: Error & { digest?: string }; reset: ()


---
Filepath: app/(a)/agents/[id]/loading.tsx  [typescript/react]

  # Components
    [Component] export default function AgentDetailLoading()


---
Filepath: app/(a)/agents/[id]/page.tsx  [typescript/react]



---
Filepath: app/(a)/agents/[id]/not-found.tsx  [typescript/react]

  # Components
    [Component] export default function AgentNotFound()


---
Filepath: app/(a)/agents/[id]/latest/loading.tsx  [typescript/react]

  # Components
    [Component] export default function AgentVersionsLoading()


---
Filepath: app/(a)/agents/[id]/latest/page.tsx  [typescript/react]



---
Filepath: app/(a)/agents/[id]/shortcuts/page.tsx  [typescript/react]



---
Filepath: app/(a)/agents/[id]/shortcuts/[shortcutId]/page.tsx  [typescript/react]



---
Filepath: app/(a)/agents/[id]/shortcuts/new/page.tsx  [typescript/react]



---
Filepath: app/(a)/agents/[id]/run/loading.tsx  [typescript/react]

  # Components
    [Component] export default function AgentRunLoading()


---
Filepath: app/(a)/agents/[id]/run/page.tsx  [typescript/react]



---
Filepath: app/(a)/agents/[id]/apps/page.tsx  [typescript/react]



---
Filepath: app/(a)/agents/[id]/v/[version]/loading.tsx  [typescript/react]

  # Components
    [Component] export default function AgentVersionLoading()


---
Filepath: app/(a)/agents/[id]/v/[version]/page.tsx  [typescript/react]

  # Utilities
    export async function generateMetadata({ params, }: { params: Promise<{ id: string; version: string }>; })


---
Filepath: app/(a)/agents/[id]/v/[version]/not-found.tsx  [typescript/react]

  # Components
    [Component] export default function VersionNotFound()


---
Filepath: app/(a)/agents/[id]/widgets/layout.tsx  [typescript/react]

  # Components
    [Component] export default function WidgetsLayout({ children, }: { children: React.ReactNode; })


---
Filepath: app/(a)/agents/[id]/widgets/loading.tsx  [typescript/react]

  # Components
    [Component] export default function WidgetsLoading()


---
Filepath: app/(a)/agents/[id]/widgets/page.tsx  [typescript/react]
```
<!-- /AUTO:signatures -->

<!-- AUTO:config -->
## Generation Config

> Auto-managed. Contains the exact parameters used to generate this README.
> Used by parent modules to auto-refresh this file when it is stale.
> Do not edit manually — changes will be overwritten on the next run.

```json
{
  "subdirectory": "app/(a)/agents",
  "mode": "signatures",
  "scope": null,
  "project_noise": null,
  "include_call_graph": true,
  "entry_points": null,
  "call_graph_exclude": [
    "tests"
  ]
}
```
<!-- /AUTO:config -->
