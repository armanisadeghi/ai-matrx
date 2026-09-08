# Notes Feature

A simple, fast notes system with folder organization, tags, and auto-labeling.

**Cross-app UI entry points** live in `features/notes/actions/`. See [`actions.md`](./actions.md) for a short developer reference and usage map.

## Auto-Save Behavior

- **Debounce Time**: 3 seconds (reduced frequency for less intrusive autosave)
- **Title/Label**: Debounced with 800ms delay, saves immediately on blur
- **Content**: Autosaves after 3 seconds of inactivity
- **Manual Save**: Always available via Save button in the active tab
- **Tab Switch**: Automatically saves pending changes when switching between notes

## Programmatic Usage

Use `NotesAPI` to interact with notes from anywhere in your app:

```typescript
import { NotesAPI } from '@/features/notes';

// Create a note
const note = await NotesAPI.create({
    label: 'Meeting Notes',
    content: 'Discussion points...',
    folder_name: 'Work',
    tags: ['important', 'meeting']
});

// Quick create (auto-labels, reuses empty notes, defaults to Draft)
const quickNote = await NotesAPI.quickCreate(
    'Content here',
    'Work'  // folder name (optional, defaults to Draft)
);

// Get all notes
const notes = await NotesAPI.getAll();

// Get specific note
const note = await NotesAPI.getById('note-id');

// Update a note
await NotesAPI.update('note-id', {
    content: 'Updated content',
    tags: ['updated']
});

// Copy a note
const duplicate = await NotesAPI.copy('note-id');

// Delete a note
await NotesAPI.delete('note-id');
```

## UI Components

### Main Interface
Full notes app at `/notes` or use `<NotesLayout />` component.

### Quick Access
- **Quick Sheet**: `⚡` → Notes (side panel for fast capture)
- **Utilities Hub**: `⚡` → Utilities Hub (full overlay)
- Both include "Open in New Tab" button to open `/notes` page

### Embed Anywhere
```typescript
import { NotesLayout } from '@/features/notes';

// Full interface with sidebar
<NotesLayout />
```

## Quick Save Utilities

Super simple "one and done" components for saving content from anywhere in your app:

### SaveToScratchButton
One-click button to save content directly to Scratch folder:

```typescript
import { SaveToScratchButton } from '@/features/notes';

// Icon button (default)
<SaveToScratchButton content={myContent} />

// Button with label
<SaveToScratchButton 
    content={myContent}
    variant="default"
    size="default"
    label="Save to Scratch"
/>
```

**Perfect for**: Quick captures, temporary notes, copy-paste operations

### SaveSelectionButton
Saves currently selected text to notes:

```typescript
import { SaveSelectionButton } from '@/features/notes';

// Save selection to Scratch (default)
<SaveSelectionButton />

// Save to specific folder
<SaveSelectionButton folder="Personal" label="Save Selection" />
```

**Perfect for**: Reading apps, documentation, research pages

### QuickSaveModal
Modal with editing and folder selection before saving:

```typescript
import { QuickSaveModal } from '@/features/notes';

function MyComponent() {
    const [isOpen, setIsOpen] = useState(false);
    
    return (
        <>
            <Button onClick={() => setIsOpen(true)}>
                Save with Options
            </Button>
            
            <QuickSaveModal
                open={isOpen}
                onOpenChange={setIsOpen}
                initialContent={myContent}
                defaultFolder="Personal"
                onSaved={() => console.log('Saved!')}
            />
        </>
    );
}
```

**Perfect for**: When users need to review/edit before saving

### QuickCaptureButton
Button that opens QuickSaveModal:

```typescript
import { QuickCaptureButton } from '@/features/notes';

// Simple floating action button
<QuickCaptureButton />

// With custom defaults
<QuickCaptureButton
    defaultContent="Pre-filled content"
    defaultFolder="Ideas"
    label="Capture Idea"
    onSaved={() => refreshMyData()}
/>
```

**Perfect for**: Toolbars, floating action buttons, quick-access areas

### Real-World Examples

**Save AI Response:**
```typescript
<SaveToScratchButton content={aiResponse} variant="outline" />
```

**Save Selected Documentation:**
```typescript
<SaveSelectionButton folder="Research" />
```

**Capture Code Snippet:**
```typescript
<QuickCaptureButton 
    defaultContent={codeSnippet}
    defaultFolder="Programming"
    label="Save Snippet"
/>
```

### How Auto-Labeling Works

**All quick save utilities benefit from automatic labeling:**

When you call `NotesAPI.create()` or use any quick save button:
1. If `label` is missing, empty, or "New Note"
2. AND content is provided
3. The system automatically generates a smart label from the content

**Examples:**
```typescript
// This will auto-generate a label from content
await NotesAPI.create({
    content: "Remember to buy milk and eggs tomorrow",
    folder_name: "Personal"
});
// Result: Label = "Remember to buy milk and eggs..."

// This will use the provided label
await NotesAPI.create({
    label: "Shopping List",
    content: "Remember to buy milk and eggs tomorrow",
    folder_name: "Personal"
});
// Result: Label = "Shopping List"

// Copying a note with "New Note" label will auto-generate
const copied = await NotesAPI.copy(noteWithNewNoteLabel);
// Result: New label generated from content, not "New Note (Copy)"
```

This means **you never have to worry about labeling** when using quick save utilities - just provide content and the system handles the rest!

## Rich Text Editing

**For when you need formatting** - The notes system includes multiple editing modes with inline view switching.

### How It Works

**Floating Mode Buttons** in the top-right corner of each note:
- 📝 **Plain Text** - Fast textarea (default)
- ✨ **WYSIWYG** - Rich text editor with formatting toolbar
- 📱 **Markdown Split** - Side-by-side markdown + preview
- 👁️ **Preview** - Rendered markdown (read-only)

**Switch instantly** - Click any button to change modes. No popups, no delays. The system remembers your last used mode per note.

### Editing Modes

**1. Plain Text (Default)**
- Lightning fast textarea
- Perfect for quick notes
- Zero overhead
- Best for mobile

**2. WYSIWYG Mode**
- Visual formatting toolbar
- Headers, bold, italic, lists
- Tables, code blocks, quotes
- What you see is what you get
- Great for formatted documents

**3. Markdown Split**
- Side-by-side editing + preview
- Write markdown on left
- See preview on right
- Perfect for technical notes

**4. Preview Mode**
- Read-only rendered view
- Full markdown rendering
- Code syntax highlighting
- Great for reviewing content

### Usage

```typescript
// Main Interface
1. Open any note
2. See floating buttons in top-right
3. Click to switch modes instantly
4. Auto-saves with your preference

// Quick saves (always plain text)
SaveToScratchButton → Plain only ✓
SaveSelectionButton → Plain only ✓
QuickSaveModal → Plain only ✓
```

### Mode Persistence

The system remembers your last mode per note:

```typescript
// Automatically saved in metadata
{
  content: "# My Rich Note\n\nWith **formatting**",
  metadata: {
    lastEditorMode: 'wysiwyg'  // or 'plain' | 'markdown' | 'preview'
  }
}

// Next time you open this note:
// - Automatically opens in WYSIWYG mode
// - All formatting preserved
// - Switch back to plain anytime
```

### Technical Details

- **Storage**: All content stored as markdown text (no schema change)
- **Performance**: Rich modes load on-demand (dynamic import)
- **Compatibility**: All modes work with the same content
- **Backward compatible**: Existing notes work perfectly
- **No overhead**: Zero impact on quick saves and plain text
- **Seamless switching**: No data loss when changing modes

### When to Use Each Mode

**Plain Text** 📝
- Quick captures
- Simple notes
- Maximum speed
- Mobile editing

**WYSIWYG** ✨
- Formatted documents
- Meeting notes
- Visual editing
- Less technical users

**Markdown Split** 📱
- Technical docs
- Code examples
- Markdown power users
- Learning markdown

**Preview** 👁️
- Reviewing content
- Sharing screen
- Reading mode
- Checking formatting

**Key Philosophy:** All modes are equal citizens. Switch freely based on your needs. The content remains the same - only the view changes.

## Context Hook

For custom UIs that need shared state:

```typescript
import { useNotesContext } from '@/features/notes';

function MyComponent() {
    const {
        notes,              // All notes
        activeNote,         // Currently selected
        isLoading,
        createNote,         // Smart create (no duplicates)
        updateNote,         // Auto-syncs everywhere
        deleteNote,
        copyNote,           // Duplicate any note
        refreshNotes,
        findOrCreateEmptyNote,  // Never creates duplicates
    } = useNotesContext();
    
    // Use the shared state
}
```

## Key Features

### Core Functionality
- **Auto-labeling**: 
  - UI: Generates titles from content (12+ chars or Enter key)
  - API: Automatically labels on save if label is missing or "New Note"
  - Works everywhere: Manual creation, quick saves, API calls
- **No duplicates**: Smart checking prevents multiple empty notes
- **Real-time sync**: All views share state automatically
- **Auto-save**: 1-second debounce with dirty tracking
- **Copy notes**: Duplicate any note with one click (smart label handling)
- **Share notes**: Generate shareable links for collaboration
- **Rich text editing**: Optional WYSIWYG markdown editor with live preview (opt-in per note)

### Organization
- **Folder organization**: Drag & drop between folders
- **Default folders**: Always-visible folders (Draft, Personal, Business, Prompts, Scratch) with custom icons
- **30+ folder categories**: Pre-configured icons & colors (Work, Programming, Study, Research, etc.)
- **Tags**: Multi-tag support with filtering

### Collaboration
- **Share with link**: Generate URL for note sharing
- **Accept shared notes**: Visit link to add note to your collection
- **Shared With Me**: Query notes shared by others (via `fetchSharedNotes`)
- **Mobile-friendly**: Responsive design

## Default Folders

Five default folders always appear (even when empty):
- **Draft** ✏️ - Work in progress (default for new notes)
- **Personal** 👤 - Personal notes
- **Business** 💼 - Work-related
- **Prompts** 💡 - AI prompts & templates
- **Scratch** 📄 - Quick notes

**Note**: All auto-generated notes default to "Draft" folder. Custom folders can still be created and appear after defaults alphabetically.

### Getting Folder List Programmatically

Use the centralized folder utility (single source of truth):

```typescript
import { getAllFolders, isDefaultFolder, getCustomFolders, getFolderIconAndColor } from '@/features/notes';

// Get complete folder list (default + custom)
const folders = getAllFolders(notes);
// Returns: ['Draft', 'Personal', 'Business', 'Prompts', 'Scratch', 'CustomFolder1', ...]

// Check if folder is a default
const isDefault = isDefaultFolder('Draft'); // true

// Get only custom folders
const customFolders = getCustomFolders(notes); // ['CustomFolder1', ...]

// Get icon & color for any folder (default or category)
const { icon, color } = getFolderIconAndColor('Work');
// Returns: { icon: BriefcaseIcon, color: 'text-blue-500 dark:text-blue-400' }
```

## Folder Categories

30+ pre-configured folder categories available when creating folders:

**Popular Categories:**
- Work, Programming, Study, Documents, Meetings
- Personal, Team, Research, Ideas, Projects
- Finances, Analytics, Emails, Images, Media, Videos
- Security, Bookmarks, Archive, Important, Cloud
- Completed, Saved, Drafts, Downloads, Shared

Each category includes:
- Custom icon (from Lucide React)
- Themed color (light & dark mode)
- Descriptive tooltip

```typescript
import { FOLDER_CATEGORIES, getFolderCategory } from '@/features/notes';

// Get all categories
FOLDER_CATEGORIES; // Array of 30+ categories

// Get specific category
const workCategory = getFolderCategory('work');
// Returns: { id: 'work', label: 'Work', icon: BriefcaseIcon, color: '...', description: '...' }
```

## Copy & Share Notes

### Copy Note

```typescript
import { NotesAPI } from '@/features/notes';

// Duplicate a note
const copiedNote = await NotesAPI.copy('note-id');
// Creates copy with "(Copy)" appended to label
```

UI: Click the **Copy** button in toolbar or quick sheet.

### Share Notes

**Generate Share Link:**
```typescript
import { generateShareLink } from '@/features/notes';

const shareUrl = generateShareLink('note-id');
// Returns: 'https://yourapp.com/notes/share/note-id'
```

**Accept Shared Note:**
Visit the share link while logged in. The note will be added to your collection.

```typescript
import { acceptSharedNote } from '@/features/notes';

// Programmatically accept (when logged in)
await acceptSharedNote('note-id', userId);
```

**Query Shared Notes:**
```typescript
import { fetchSharedNotes } from '@/features/notes';

// Get all notes shared with current user
const sharedNotes = await fetchSharedNotes(userId);
```

UI: Click the **Share** button in toolbar to generate a shareable link. Copy and send to anyone.

## Database

Table: `notes`
```sql
- id (uuid)
- user_id (uuid, RLS protected)
- label (text)
- content (text)
- folder_name (text)
- tags (text[])
- metadata (jsonb)
- is_deleted (boolean)
- position (integer)
- created_at (timestamptz)
- updated_at (timestamptz, auto-updated)
```

## Component Overview

**Full Interface:**
- `NotesLayout` - Complete notes app with sidebar (`features/notes/components/`)
- `QuickNotesSheet` - Compact sheet version (`features/notes/actions/`)

**Quick Actions** (`features/notes/actions/`):
- `SaveToScratchButton` - One-click save to Scratch
- `SaveSelectionButton` - Save selected text
- `QuickCaptureButton` - Opens modal for editing
- `QuickSaveModal` / `QuickNoteSaveModal` - Edit + folder selection

**When to Use What:**
- Need full app? → `NotesLayout` or `/notes` route
- Quick capture in header? → `QuickNotesButton` (exported; wire where needed) or `useQuickActions().openQuickNotes()`
- Save AI output? → `SaveToScratchButton`
- Save while reading? → `SaveSelectionButton`
- Need user to edit first? → `QuickSaveModal` or `QuickCaptureButton`

## Architecture

- **Provider**: Single instance in `app/Providers.tsx`
- **Service**: Supabase CRUD operations
- **Context**: Global state management
- **API**: Public programmatic interface
- **Utilities**: Drop-in buttons for common workflows

## Supabase Realtime Setup

The notes feature uses Supabase Realtime `postgres_changes` for live sync across tabs/devices. Three prerequisites must be met on the Supabase side for this to work.

### Prerequisite 1: Table in Publication

The `notes` table must be added to the `supabase_realtime` publication. Without this, the WAL replication slot won't capture changes for notes.

```sql
-- Check current tables in the publication
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- Add notes if missing (idempotent — errors if already present)
ALTER PUBLICATION supabase_realtime ADD TABLE notes;
```

### Prerequisite 2: Realtime Schema Migrations

The Supabase Realtime service maintains a `realtime` schema in the database with ~68 internal migrations (functions like `list_changes`, `apply_rls`, types like `realtime.action`, and the `subscription` table). If these migrations are stuck or broken, **ALL** `postgres_changes` subscriptions across the entire project will fail with `CHANNEL_ERROR`.

**Diagnosis**: Open `Supabase Dashboard > Logs > Realtime` and look for:
- `MigrationsFailedToRun` — the schema is in a broken state
- `PoolingReplicationError: function realtime.list_changes(...) does not exist` — a critical function was never created

**Known Issue — Table Name Collision**: Migration #8 creates `realtime.action` ENUM using `IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'action')`. This check is **not schema-qualified** — if ANY table named `action` exists in ANY schema (including `public.action`), the check passes and `realtime.action` is never created. All subsequent migrations that reference `realtime.action` then fail with `type "realtime.action" does not exist`.

**Fix for name collision** (the `public.action` table scenario):
1. Temporarily rename the conflicting table: `ALTER TABLE public.action RENAME TO _action_backup;`
2. Clear stuck migration tracking: `TRUNCATE realtime.schema_migrations;` then re-insert the 7 original 2021 migrations (or let the service re-run all — migrations 1-7 are idempotent for tables/types)
3. Trigger a client connection (subscribe to any channel) — the service auto-retries migrations
4. Verify all 68 migrations applied: `SELECT COUNT(*) FROM realtime.schema_migrations;`
5. Rename the table back: `ALTER TABLE public._action_backup RENAME TO action;`

**Verify current health**:
```sql
SELECT COUNT(*) as migrations_applied FROM realtime.schema_migrations;
-- Should be 68
SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'list_changes' AND pronamespace = 'realtime'::regnamespace);
-- Should be true
```

### Prerequisite 3: Replica Identity

The `notes` table uses `default` replica identity (primary key only). This means:
- **INSERT/UPDATE**: `payload.new` contains the full row — works correctly.
- **DELETE**: `payload.old` contains only `{ id }` — the subscription handler only needs the ID, so this is fine.

If you need the full old row on DELETE (e.g., for undo), set replica identity to `full`:
```sql
ALTER TABLE notes REPLICA IDENTITY FULL;
```

### How the Subscription Works

`NotesContext.tsx` no longer owns this — the subscription is
[`features/notes/redux/realtimeMiddleware.ts`](./redux/realtimeMiddleware.ts), Redux
middleware built on `@ai-matrx/realtime` (`defineChannelNamespace` + the shared
`RealtimeManager`). It does **not** hand-roll a `supabase.channel(...)` call, echo
suppression, or a reconnect/backoff ladder — the package owns all of that (unique
instance topics, the write ledger that classifies a note's own echo via the
`updated_by` actor stamp, jittered reconnect with a stability reset, `onBackfill` for
tab-wake/network-restore/queue-overflow catch-up). Before touching realtime here,
**invoke the `supabase-realtime` skill** — it is the doctrine, not this file.

What stays feature-specific, on top of the package:
- **Writes are registered on the ledger at one convergence point** — `markNoteSaving` /
  `markNoteSaved`, called by every write path (autosave middleware, the `saveNote`
  thunk, `notesService` for legacy surfaces) — so `classify` can recognize an echo of
  a write it was told about, without each writer copying the bookkeeping.
- **Conflict detection** — compares `updated_at` timestamps; shows a toast with a
  "Refresh" action when the active note is modified externally.
- **Dirty flag** — prevents a list refresh from overwriting unsaved editor content.
- **Live-editor attribution** ("X is editing") is feature UX, not echo suppression,
  and stays here — built on the same `updated_by` stamp.

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `CHANNEL_ERROR: mismatch between server and client bindings` | Broken `realtime` schema (missing migrations). Often caused by a `public.action` table blocking `realtime.action` ENUM creation | See "Known Issue — Table Name Collision" above |
| No events received, no errors | Table not in `supabase_realtime` publication | `ALTER PUBLICATION supabase_realtime ADD TABLE notes;` |
| Events received for all users | Missing `filter` parameter or broken RLS | Add `filter: 'user_id=eq.${userId}'` to the subscription |
| `TIMED_OUT` on subscribe | Network/auth delay | supabase-js auto-retries; check auth session |
| DELETE payload missing fields | Replica identity is `default` (PK only) | Expected — handler only needs `payload.old.id` |

## Realtime — the doctrine lives elsewhere now

🚨 **Do not hand-write a `supabase.channel(...)` subscription anywhere in this
project.** Every `postgres_changes`, broadcast, and presence subscription rides
`@ai-matrx/realtime` (`defineChannelNamespace` + `useChannel` / the Redux manager) —
the package owns the single `event: '*'` binding, unique instance topics, cleanup,
dedup, echo suppression via the write ledger, and jittered reconnect with
`onBackfill` catch-up, which a hand-rolled channel structurally cannot have. Before
writing or modifying ANY channel, **invoke the `supabase-realtime` skill** — that is
the canonical, project-wide reference; this section used to duplicate it and is now
a pointer instead.

Two Supabase-side (not application-code) facts still worth keeping local to notes:

- **Publication membership** — a table must be in the `supabase_realtime` publication
  or no WAL events are emitted for it at all, regardless of client code:
  `ALTER PUBLICATION supabase_realtime ADD TABLE your_table_name;`
- **Table name accuracy** — the `table` filter must match the exact Postgres table
  name (a common miss is plural vs. singular, e.g. `cx_conversations` vs.
  `cx_conversation`); verify with
  `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;`

