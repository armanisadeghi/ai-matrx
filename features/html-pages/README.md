# HTML Pages Feature

A comprehensive markdown-to-HTML publishing system that allows users to create, edit, preview, and publish HTML pages with SEO metadata to a Supabase database. Features a source files architecture, markdown-first workflow, and prevents page duplication.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Core Concepts](#core-concepts)
- [Getting Started](#getting-started)
- [Components](#components)
- [Hooks](#hooks)
- [Services](#services)
- [Utilities](#utilities)
- [Usage Examples](#usage-examples)
- [Database](#database)
- [Environment Variables](#environment-variables)

---

## Overview

The HTML Pages feature provides:

- **Markdown-First Workflow**: Write in markdown, generate styled HTML
- **Source Files Architecture**: Complete HTML generated from three sources (content, CSS, metadata)
- **Rich Editing Experience**: WYSIWYG editor, plain text editor, and live preview
- **SEO Optimization**: Full metadata support (title, description, keywords, OG tags, canonical URL)
- **Publishing System**: Create/update pages in Supabase database with no duplicates
- **WordPress-Ready CSS**: Professional styling with `matrx-` prefixed classes
- **Copy Operations**: Multiple copy formats (with/without styles, custom options)
- **Live Preview**: Instant preview with proper styling before publishing

---

## Architecture

### Source Files Architecture

The system uses a **"source files"** approach where complete HTML is **always generated** from three editable sources:

1. **content.html** - Body content only (editable)
2. **wordpress.css** - Styling rules (editable)
3. **metadata.json** - SEO and meta information (editable)
4. **complete.html** - Generated from above sources (READ-ONLY)

This ensures consistency and prevents drift between different representations of the same content.

### Workflow

```
Markdown → contentHtml → Complete HTML (with CSS + Metadata) → Database
    ↓
  Edit → Regenerate → Update Database (same page ID)
```

### Key Principles

- **Single Page ID**: One page is created, then updated—no duplicates
- **User-Triggered Publishing**: No automatic page creation
- **Dirty State Tracking**: System knows when content needs regeneration
- **Reset Support**: Can revert to original markdown at any time

---

## Directory Structure

```
features/html-pages/
├── components/
│   ├── tabs/                              # Individual tab components
│   │   ├── MarkdownSplitViewTab.tsx       # TUI split view editor
│   │   ├── MarkdownWysiwygTab.tsx         # TUI WYSIWYG editor
│   │   ├── MarkdownPlainTextTab.tsx       # Plain text markdown editor
│   │   ├── MarkdownPreviewTab.tsx         # Markdown preview
│   │   ├── HtmlCodeFilesTab.tsx           # Multi-file code viewer/editor
│   │   ├── HtmlCodeTab.tsx                # HTML code view
│   │   ├── WordPressCSSTab.tsx            # CSS code view
│   │   ├── CompleteHtmlTab.tsx            # Complete HTML document view
│   │   ├── EditHtmlTab.tsx                # HTML editor
│   │   ├── CustomCopyTab.tsx              # Custom copy options
│   │   ├── SavePageTab.tsx                # Publish with metadata
│   │   └── index.ts                       # Barrel exports
│   ├── HtmlPreviewFullScreenEditor.tsx    # Full-screen editor (6 tabs)
│   ├── HtmlPreviewModal.tsx               # Original modal (preserved)
│   ├── PreviewPlaceholder.tsx             # Loading placeholder
│   ├── types.ts                           # TypeScript interfaces
│   ├── testTypes.ts                       # Test type definitions
│   ├── README.md                          # Components documentation
│   └── SIMPLIFIED-ARCHITECTURE.md         # Architecture details
├── css/
│   ├── wordpress-styles.ts                # Single source of truth for CSS
│   └── matrx-wordpress-styles-example.css # Example CSS file
├── hooks/
│   ├── useHTMLPages.js                    # Database operations hook
│   └── useHtmlPreviewState.ts             # State management hook
├── services/
│   └── htmlPageService.js                 # Database service (CRUD + metadata)
├── code-preview/
│   ├── HtmlPageRenderPreview.tsx          # /code render-preview iframe
│   └── registerHtmlPageRenderPreview.ts   # registerRenderPreviewer("html-page:")
├── utils/
│   ├── html-preview-utils.ts              # Preview utilities
│   ├── html-source-files-utils.ts         # Source files management
│   └── markdown-wordpress-utils.ts        # Markdown → HTML conversion
└── README.md                              # This file
```

---

## Core Concepts

### 1. Source Files

All HTML is derived from three source files:

```typescript
interface HtmlSourceFiles {
  contentHtml: string; // Body content only
  wordPressCSS: string; // CSS rules
  metadata: HtmlMetadata; // SEO metadata
  scripts?: string; // Future: LD+JSON, etc.
}
```

**Complete HTML is always generated** using `generateCompleteHtmlFromSources()`:

```typescript
const completeHtml = generateCompleteHtmlFromSources({
  contentHtml,
  wordPressCSS,
  metadata,
});
```

### 2. Dirty State Tracking

The system tracks two types of changes:

- **isMarkdownDirty**: `true` when markdown is edited
- **isContentDirty**: `true` when HTML is directly edited

This allows intelligent regeneration—only regenerate when needed.

### 3. Single Page Publishing

```typescript
if (publishedPageId) {
  // Update existing page
  result = await updateHTMLPage(
    publishedPageId,
    html,
    metaTitle,
    metaDesc,
    metaFields,
  );
} else {
  // Create new page (first time only)
  result = await createHTMLPage(html, metaTitle, metaDesc, metaFields);
  onPageIdChange?.(result.pageId); // Store ID in parent
}
```

**No duplicate pages are created.** The parent component stores `publishedPageId` and passes it to the hook.

### 4. Metadata

```typescript
interface HtmlMetadata {
  title: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  ogImage: string;
  canonicalUrl: string;
}
```

Metadata can be:

- Auto-extracted from content (first H1/H2 becomes title, first paragraph becomes description)
- Manually edited in the Publish tab
- Stored in the database with the page

---

## Getting Started

### Prerequisites

1. **Environment Variables** (see [Environment Variables](#environment-variables))
2. **Supabase Database** with `html_pages` table (see [Database](#database))
3. **User Authentication** (pages are user-scoped)

### Quick Start

```tsx
import { useHtmlPreviewState } from "@/features/html-pages/hooks/useHtmlPreviewState";
import HtmlPreviewFullScreenEditor from "@/features/html-pages/components/HtmlPreviewFullScreenEditor";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";

function MyComponent() {
  const user = useAppSelector(selectUser);
  const [isOpen, setIsOpen] = useState(false);
  const [publishedPageId, setPublishedPageId] = useState(null);

  const markdownContent = "# Hello World\n\nThis is my content.";

  const htmlPreviewState = useHtmlPreviewState({
    markdownContent,
    user,
    isOpen,
    publishedPageId,
    onPageIdChange: setPublishedPageId,
  });

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Edit & Publish</button>

      {isOpen && (
        <HtmlPreviewFullScreenEditor
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          htmlPreviewState={htmlPreviewState}
          title="My Editor"
          description="Edit and publish content"
        />
      )}
    </>
  );
}
```

---

## Components

### HtmlPreviewFullScreenEditor

The main editing interface with 6 tabs:

1. **Rich Text Editor** - WYSIWYG markdown editing (TUI Editor)
2. **Plain Text Editor** - Simple textarea for markdown
3. **Matrx Preview** - Rendered markdown preview
4. **HTML Files** - Multi-file code viewer (content.html, wordpress.css, complete.html, metadata.json)
5. **Custom Copy** - Copy with custom options (bullets, line breaks)
6. **Publish** - Publish with SEO metadata + live preview

```tsx
<HtmlPreviewFullScreenEditor
  isOpen={boolean}
  onClose={() => void}
  htmlPreviewState={HtmlPreviewState & HtmlPreviewActions}
  title="Optional Title"
  description="Optional Description"
  onSave={(markdown) => void}  // Optional save callback
  showSaveButton={boolean}      // Optional save button
/>
```

### HtmlPreviewModal

Original modal component (preserved for backward compatibility):

```tsx
<HtmlPreviewModal
  isOpen={boolean}
  onClose={() => void}
  htmlContent="<h1>HTML content</h1>"
  title="Optional Title"
/>
```

### Individual Tabs

All tabs can be used independently:

```tsx
import {
  SavePageTab,
  HtmlCodeFilesTab,
} from "@/features/html-pages/components/tabs";

<SavePageTab state={htmlPreviewState} actions={htmlPreviewState} user={user} />;
```

---

## Hooks

### useHtmlPreviewState

**Main state management hook** for all HTML preview functionality.

```typescript
const htmlPreviewState = useHtmlPreviewState({
  markdownContent: string,       // Initial markdown
  htmlContent?: string,           // Or initial HTML
  user: User,                     // Current user
  isOpen?: boolean,               // Is editor open?
  publishedPageId?: string,       // Existing page ID (for updates)
  onPageIdChange?: (id) => void,  // Callback when page created
  resetKey?: number,              // Increment to reset state
});
```

**Returns:** Combined state and actions object with:

**State:**

- `contentHtml`, `wordPressCSS`, `metadata` - Source files
- `currentMarkdown`, `initialMarkdown` - Markdown state
- `isMarkdownDirty`, `isContentDirty` - Dirty flags
- `publishedPageUrl`, `savedPage` - Publishing state
- `isCreating`, `error` - System state

**Actions:**

- `handleRegenerateHtml(useMetadata?)` - Regenerate and publish
- `handleSavePage()` - Publish with metadata
- `handleRefreshMarkdown()` - Reset to original
- `handleUpdateFromMarkdown()` - Regenerate source files from markdown
- `setContentHtml()`, `setMetadata()`, `setMetadataField()` - Source file setters
- Copy handlers: `handleCopyHtml()`, `handleCopyCSS()`, `handleCopyComplete()`, etc.

### useHTMLPages

**Database operations hook** (used internally by `useHtmlPreviewState`):

```typescript
const {
  createHTMLPage,
  updateHTMLPage,
  getUserPages,
  deletePage,
  getPage,
  isCreating,
  error,
  clearError,
} = useHTMLPages(userId);
```

---

## Services

### HTMLPageService

**Database service** for HTML pages CRUD operations:

```javascript
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";

// Create page
const result = await HTMLPageService.createPage(
  htmlContent,
  metaTitle, // Required: SEO meta title
  metaDescription, // Optional: SEO meta description
  userId,
  metaFields, // { metaKeywords, ogImage, canonicalUrl, isIndexable }
);
// Returns: { success, pageId, url, metaTitle, metaDescription, isIndexable, createdAt }

// Update page
const result = await HTMLPageService.updatePage(
  pageId,
  htmlContent,
  metaTitle, // Required: SEO meta title
  metaDescription, // Optional: SEO meta description
  userId,
  metaFields, // { metaKeywords, ogImage, canonicalUrl, isIndexable }
);

// Get user's pages (returns meta_title, meta_description, is_indexable)
const pages = await HTMLPageService.getUserPages(userId);

// Get single page
const page = await HTMLPageService.getPage(pageId);

// Delete page
await HTMLPageService.deletePage(pageId, userId);
```

---

## Utilities

### html-source-files-utils.ts

Source files management:

```typescript
// Generate complete HTML from sources
generateCompleteHtmlFromSources(sources: HtmlSourceFiles): string

// Extract metadata from content
extractMetadataFromContent(contentHtml: string): Partial<HtmlMetadata>

// Parse complete HTML to sources
parseCompleteHtmlToSources(completeHtml: string): Partial<HtmlSourceFiles>

// Update title in content
updateTitleInContent(contentHtml: string, newTitle: string): string

// Metadata helpers
createEmptyMetadata(): HtmlMetadata
formatMetadataAsJson(metadata: HtmlMetadata): string
parseJsonToMetadata(jsonString: string): HtmlMetadata
```

### html-preview-utils.ts

Preview and processing utilities:

```typescript
// Extract body from complete HTML
extractBodyContent(completeHtml: string, fallback?: string): string

// Strip bullet styles
stripBulletStyles(html: string): string

// Strip decorative line breaks
stripDecorativeLineBreaks(html: string): string

// Apply custom options
applyCustomOptions(html: string, options: {...}): string

// SEO helpers
getCharacterCountStatus(text: string, ideal: number, max: number): {...}
getSEORecommendation(text: string, field: string): string
```

### markdown-wordpress-utils.ts

Markdown to HTML conversion:

```typescript
// Convert markdown to WordPress HTML with matrx- classes
markdownToWordPressHTML(markdown: string, includeThinking?: boolean): string

// Format JSON for clipboard
formatJsonForClipboard(data: any): string
```

### wordpress-styles.ts

**Single source of truth** for CSS:

```typescript
// Get CSS synchronously
getWordPressCSS(): string

// Load CSS asynchronously (with fallback)
loadWordPressCSS(): Promise<string>
```

---

## Usage Examples

### Example 1: Basic Publishing

```tsx
function PublishMarkdown() {
  const user = useAppSelector(selectUser);
  const [publishedPageId, setPublishedPageId] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  const markdown = "# My Article\n\nGreat content here.";

  const htmlPreviewState = useHtmlPreviewState({
    markdownContent: markdown,
    user,
    isOpen,
    publishedPageId,
    onPageIdChange: setPublishedPageId,
  });

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        {publishedPageId ? "Edit Page" : "Create Page"}
      </button>

      {isOpen && (
        <HtmlPreviewFullScreenEditor
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          htmlPreviewState={htmlPreviewState}
        />
      )}
    </>
  );
}
```

### Example 2: Direct Service Usage

```javascript
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";

async function publishPage(userId) {
  const htmlContent = "<h1>Hello World</h1><p>My content</p>";

  const result = await HTMLPageService.createPage(
    htmlContent,
    "My Page Title", // metaTitle (required)
    "A short description", // metaDescription (optional)
    userId,
    {
      metaKeywords: "keyword1, keyword2",
      ogImage: "https://example.com/image.jpg",
      canonicalUrl: "https://example.com/canonical",
      isIndexable: false, // Default: false (noindex)
    },
  );

  console.log("Published at:", result.url);
  // https://mymatrx.com/p/uuid
}
```

### Example 3: Using Individual Tabs

```tsx
import { SavePageTab, HtmlCodeFilesTab } from "@/features/html-pages/components/tabs";

function CustomEditor() {
  const user = useAppSelector(selectUser);
  const htmlPreviewState = useHtmlPreviewState({...});

  return (
    <div>
      <HtmlCodeFilesTab
        state={htmlPreviewState}
        actions={htmlPreviewState}
        user={user}
      />

      <SavePageTab
        state={htmlPreviewState}
        actions={htmlPreviewState}
        user={user}
      />
    </div>
  );
}
```

---

## Database

### Schema

The `html_pages` table lives in a **separate Supabase project** (`viyklljfdhtidwecakwx` — "My Matrx"),
not the main AI Matrx project. See `common-docs/systems/cms-system/FEATURE.md` for the full cross-repo picture
(this table + the full `client_*` CMS live in the same project).

```sql
CREATE TABLE html_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  html_content TEXT NOT NULL,
  user_id UUID NOT NULL,

  -- SEO Metadata (unified fields)
  meta_title VARCHAR(255) NOT NULL,
  meta_description TEXT,
  meta_keywords TEXT,
  og_image TEXT,
  canonical_url TEXT,

  -- Search Engine Indexing Control
  is_indexable BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_html_pages_user_id ON html_pages(user_id);
CREATE INDEX idx_html_pages_created_at ON html_pages(created_at DESC);
```

**Important Schema Notes:**

- `meta_title` and `meta_description` are now the **only** title/description fields (no duplication)
- `is_indexable` defaults to `FALSE` to prevent duplicate content issues with search engines
- Pages are **noindex by default** - only set `is_indexable: true` for pages you want indexed

### Authorization — server-verified, not RLS

RLS is enabled on `html_pages`, but **every write in this repo goes through the secret key**
(`SUPABASE_HTML_SECRET_KEY`), which bypasses it entirely — ownership is enforced in **app code**,
not by Postgres. The only write path: browser → `HTMLPageService` (`services/htmlPageService.js`) →
`POST /api/html-pages` → the route verifies the caller's session against the **main** app's
Supabase Auth (`txzxabzwovsujtloxrus`), then reads/writes `html_pages` with the secret key, filtering
every query by `user_id = session.user.id`. There is no browser-side Supabase client for this
project in this repo — a direct anon-key client would need its own RLS policies and its own
auth session against a project this repo's users never sign into, which is exactly the dead
architecture `lib/supabase-html.ts` implemented and was removed 2026-07-09 (zero callers).

### URL Format

Published pages are accessible at:

```
https://mymatrx.com/p/{page-uuid}
```

---

## Environment Variables

```bash
# Supabase credentials for the html_pages / client_* project (viyklljfdhtidwecakwx).
# Use ONLY the sb_publishable_* / sb_secret_* keys. Legacy JWT keys (anon / service_role)
# are DEPRECATED and BANNED in this repo. Docs: https://supabase.com/docs/guides/getting-started/api-keys
NEXT_PUBLIC_SUPABASE_HTML_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_HTML_PUBLISHABLE_KEY=sb_publishable_...   # unused by this feature today — no browser client
SUPABASE_HTML_SECRET_KEY=sb_secret_...                          # SERVER-ONLY — read by app/api/html-pages and app/api/cms/* routes, never sent to the browser

# Public URL for published pages
NEXT_PUBLIC_HTML_SITE_URL=https://mymatrx.com
```

---

## Key Features

✅ **Markdown-First**: Start with markdown, generate professional HTML  
✅ **No Duplicates**: Single page ID, always update the same page  
✅ **Source Files Architecture**: Consistent HTML generation from three sources  
✅ **Rich Editing**: WYSIWYG, plain text, and live preview  
✅ **SEO Optimization**: Full metadata support with character counters  
✅ **WordPress-Ready**: CSS with `matrx-` prefixed classes  
✅ **Smart Regeneration**: Only regenerate when needed (dirty state tracking)  
✅ **Reset Support**: Revert to original markdown anytime  
✅ **Live Preview**: See exactly what will be published  
✅ **Copy Operations**: Multiple formats for different use cases  
✅ **User-Scoped**: All pages are tied to user accounts with RLS

---

## Additional Documentation

- **[components/README.md](components/README.md)** - Detailed component documentation
- **[components/SIMPLIFIED-ARCHITECTURE.md](components/SIMPLIFIED-ARCHITECTURE.md)** - Architecture deep dive
- **Main codebase docs** - See `/docs` directory for related systems

---

## Migration from Old System

If you're using the old `HtmlPreviewModal`, no changes are needed—it's preserved for backward compatibility. To migrate to the new system:

1. Replace `HtmlPreviewModal` with `HtmlPreviewFullScreenEditor`
2. Use `useHtmlPreviewState` hook for state management
3. Store `publishedPageId` in parent component
4. Pass `onPageIdChange` callback to receive the page ID on first publish

---

---

## Management UI (2026-07-08)

Standalone `html_pages` (not CMS `client_pages`) can be managed at:

- `/cms/html-pages` — list / create / delete
- `/cms/html-pages/[pageId]` — edit metadata + HTML + preview

Also listed in the `/code` Library panel under **HTML Pages** (adapter proxies `/api/html-pages`).

### `/code` live preview

`html-page:` tabs get an **Open live preview** eye icon (render-preview registry). Implementation:

- [`code-preview/HtmlPageRenderPreview.tsx`](./code-preview/HtmlPageRenderPreview.tsx) — dirty → `srcDoc` of Monaco buffer; clean → published `url?preview=1` (same semantics as `HtmlPageEditor`)
- [`code-preview/registerHtmlPageRenderPreview.ts`](./code-preview/registerHtmlPageRenderPreview.ts) — `registerRenderPreviewer("html-page:", …)`
- Side-effect imported from [`features/code/CodeWorkspace.tsx`](../code/CodeWorkspace.tsx)

Only `html_content` / the live buffer drives the iframe. SEO metadata columns are not injected.

---

## Agent surface (2026-07-10)

`HtmlPageEditor` mounts the `matrx-user/html-page` Surface Values row (`ui_surface`, seeded via
`migrations/cms_surfaces_seed.sql`) — the canonical v3 context menu on every editable region:

- Meta description → `EditableContextMenu` + `ProTextarea`
- HTML body (Monaco/`SmallCodeEditor`) → `EditableContextMenu` wraps the container
- Preview iframe → `NonEditableContextMenu`
- `extraSections`: Save, Copy Live URL, Open Live Page, Back to Published Pages — real handlers, see
  `features/html-pages/agent-context/htmlPageExtraSections.ts`

**List route (`/cms/html-pages`) also mounts the surface.** The reusable `HtmlPagesContextMenu`
wraps the list chrome (outer, in `page.tsx`), each table row (`HtmlPageListView`), and each grid card
(`HtmlPageGridView`) with a `NonEditableContextMenu`. Framing value is the same
`html_pages_structure`, built list-side by `buildHtmlPagesListContextData.ts` (list-level → no
`current`; per-row → that page marked `current="true"` with its identity filled from the summary).
Actions (New / Open / Copy URL / Open Live / Back to Content Manager) live in
`htmlPagesListExtraSections.ts`. Table-row menus pass `enableFloatingIcon={false}` — the
floating-selection icon renders a hidden `<span>` sibling of the trigger, which is invalid DOM
directly inside `<tbody>`.

**`content`/`selection`/`text_before`/`text_after` are gated by `activeTab`** (mirrors `cms-page`'s
`activeTabContent` in `buildCmsPageContextData.ts`) — `content` = `htmlContent` on the HTML tab,
`metaDescription` on the Metadata tab, empty on Preview. Verified live 2026-07-10: right-clicking the
description field previously leaked the full (13KB+) HTML document into `content` because the scope
builder always read the meta-description textarea's selection against the HTML buffer; fixed in
`buildHtmlPageContextData.ts` / `useHtmlPageSurfaceScope.ts`.

## Canonical SEO metadata rules (2026-07-29)

All HTML page editors and save dialogs import title/description counts,
recommendations, and limits from `features/marketing/seo/serp/metrics.ts`.
They must not declare local SEO thresholds. The current policy is title
15–60 characters and 600px on desktop/mobile; description 70–160 characters
and 920px on desktop/mobile.

**Known limitation — Monaco owns right-click on its own text.** `SmallCodeEditor`'s underlying Monaco
instance stops the native `contextmenu` event before it reaches our `EditableContextMenu` wrapper, so
right-clicking directly on a code line opens Monaco's built-in menu (Go to Symbol, Rename, Format,
Cut/Copy/Paste), not the v3 agent menu. `Save`/menu actions bound to the wrapper still work via other
entry points (the `extraSections` and the Metadata-tab menu). Fixing this would mean disabling
Monaco's `contextmenu` option in the **shared** `SmallCodeEditor` component (`features/code-editor/`),
which affects every other consumer — out of scope for this rollout; flagged for a follow-up if agent
actions on the HTML tab's code itself become a priority.

Framing value is `html_pages_structure` (`features/html-pages/utils/buildHtmlPagesStructureXml.ts`) —
a flat list of sibling pages (from `useHtmlPagesManager()`), **not** the CMS `site_structure` tree;
this is the other content system and never shares that shape. Agent-context builder:
`features/html-pages/agent-context/buildHtmlPageContextData.ts`; scope hook:
`features/html-pages/hooks/useHtmlPageSurfaceScope.ts`. See `features/cms/FEATURE.md` → "Agent
surfaces (Surface Values)" for the full five-surface picture and `features/cms/SKILL.md` for the
builder checklist.

**Last Updated:** 2026-07-10  
**Version:** 2.5 (List route `/cms/html-pages` now mounts the v3 menu on chrome + rows + cards via
`HtmlPagesContextMenu`; added `buildHtmlPagesListContextData` + `htmlPagesListExtraSections`. Prior:
2.4 — fixed `content` leaking full HTML doc into the Metadata-tab menu; documented Monaco
context-menu limitation)
