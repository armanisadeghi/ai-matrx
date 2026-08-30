# HTML Preview Components

This directory contains modular, reusable components for HTML preview functionality with **full markdown editing support**. The components can be used independently or integrated into a full-screen editor.

## Structure

```
features/html-pages/components/
├── types.ts                            # TypeScript interfaces and types
├── useHtmlPreviewState.ts             # Shared hook for state management
├── HtmlPreviewModal.tsx               # Original modal (preserved, unchanged)
├── HtmlPreviewFullScreenExample.tsx   # Basic HTML-only example
├── HtmlPreviewFullScreenEditor.tsx    # Full editor with markdown support
└── tabs/
    ├── index.ts                       # Barrel export for all tabs
    # Markdown Tabs
    ├── MarkdownSplitViewTab.tsx       # Split view markdown editor (TUI)
    ├── MarkdownWysiwygTab.tsx         # WYSIWYG markdown editor (TUI)
    ├── MarkdownPlainTextTab.tsx       # Plain text markdown editor
    ├── MarkdownPreviewTab.tsx         # Markdown preview
    # HTML Control
    ├── HtmlControlsTab.tsx            # Regenerate HTML, refresh markdown
    # HTML Tabs
    ├── HtmlPreviewTab.tsx             # Preview tab with WordPress CSS styling
    ├── HtmlCodeTab.tsx                # HTML code view tab
    ├── WordPressCSSTab.tsx            # WordPress CSS tab
    ├── CompleteHtmlTab.tsx            # Complete HTML document tab
    ├── CustomCopyTab.tsx              # Custom copy options tab
    ├── EditHtmlTab.tsx                # HTML editor tab
    └── SavePageTab.tsx                # Save page form tab
```

## Key Features

- **Markdown as Source of Truth**: Edit markdown, automatically generate HTML
- **Multiple Markdown Editors**: Split view, WYSIWYG, plain text
- **HTML Regeneration**: Convert edited markdown to HTML on demand
- **Modular Design**: Each tab is an independent component
- **Shared State**: All tabs share state through a centralized hook
- **Reusable**: Can be used in modals, full-screen editors, or standalone
- **TypeScript**: Fully typed for safety and autocomplete
- **No Breaking Changes**: Original `HtmlPreviewModal.tsx` remains untouched

## Architecture Highlights

### Synchronous Initialization
The hook initializes CSS synchronously using `getMarkdownStylesheet()` from `@ai-matrx/print/markdown` instead of async loading. This ensures:
- ✅ Initial preview pages include CSS from the start
- ✅ Complete HTML generated correctly on first render
- ✅ Monaco editor auto-format works on properly formed HTML
- ✅ No race conditions between CSS loading and HTML generation
- ✅ Consistent, predictable behavior

### State Persistence
The `useHtmlPreviewState` hook is initialized in the parent component (`ResponseLayoutManager`) rather than within the modal, ensuring:
- State persists across modal open/close cycles
- User edits are preserved when toggling the editor
- Preview URLs remain available without regeneration

## Usage

### 1. Using the Shared Hook (Markdown-First Approach)

The `useHtmlPreviewState` hook manages all state for both markdown and HTML:

```tsx
import { useHtmlPreviewState } from "@/features/html-pages/components/useHtmlPreviewState";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";

function MyComponent({ markdownContent }: { markdownContent: string }) {
    const user = useAppSelector(selectUser);
    
    const htmlPreviewState = useHtmlPreviewState({
        markdownContent,  // Source of truth
        user,
        isOpen: true
    });
    
    // Access markdown state
    // htmlPreviewState.currentMarkdown, htmlPreviewState.initialMarkdown
    
    // Access HTML state (auto-generated from markdown)
    // htmlPreviewState.generatedHtmlContent, htmlPreviewState.isHtmlDirty
    
    // Actions
    // htmlPreviewState.handleRegenerateHtml(), htmlPreviewState.handleRefreshMarkdown()
}
```

### 2. Using HtmlPreviewFullScreenEditor (Recommended)

The `HtmlPreviewFullScreenEditor` provides a complete markdown-to-HTML workflow. For best results, **manage the hook state in the parent component** to preserve state between opens/closes:

```tsx
import { useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { useHtmlPreviewState } from "@/features/html-pages/components/useHtmlPreviewState";
import HtmlPreviewFullScreenEditor from "@/features/html-pages/components/HtmlPreviewFullScreenEditor";

function MyComponent({ markdownContent }: { markdownContent: string }) {
    const user = useAppSelector(selectUser);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    
    // Initialize hook at parent level to preserve state between opens
    const htmlPreviewState = useHtmlPreviewState({
        isOpen: isEditorOpen,
        markdownContent,
        user,
    });
    
    const handleSave = (newMarkdown: string) => {
        // Handle the edited markdown
        console.log('Saved:', newMarkdown);
        setIsEditorOpen(false);
    };
    
    return (
        <>
            <button onClick={() => setIsEditorOpen(true)}>
                Edit Markdown
            </button>
            
            {isEditorOpen && (
                <HtmlPreviewFullScreenEditor
                    isOpen={isEditorOpen}
                    onClose={() => setIsEditorOpen(false)}
                    htmlPreviewState={htmlPreviewState}
                    title="Edit Content"
                    description="Edit markdown and preview/publish as HTML"
                    onSave={handleSave}
                    showSaveButton={true}
                />
            )}
        </>
    );
}
```

**Why manage the hook in the parent?**
- State persists between open/close cycles
- Preview URLs are maintained (no duplicate page creation)
- User edits are preserved even if they close the editor
- More efficient - no recreation of preview pages on reopen

### 3. The Markdown → HTML Workflow

1. **Start with markdown**: Pass `markdownContent` to the hook
2. **Edit markdown**: Use any markdown tab to edit
3. **HTML marked as dirty**: When markdown changes, `isHtmlDirty` becomes `true`
4. **Regenerate HTML**: Click "Regenerate HTML" to convert markdown to HTML
5. **Preview/Save**: HTML tabs now reflect the updated content

### 4. Using Individual Tabs

Import and use any tab component independently:

```tsx
import { HtmlPreviewTab, HtmlCodeTab } from "@/features/html-pages/components/tabs";
import { useHtmlPreviewState } from "@/features/html-pages/components/useHtmlPreviewState";

function MyComponent({ htmlContent }: { htmlContent: string }) {
    const user = useAppSelector(selectUser);
    const htmlPreviewState = useHtmlPreviewState({ htmlContent, user, isOpen: true });
    
    return (
        <div>
            <HtmlPreviewTab
                htmlContent={htmlContent}
                state={htmlPreviewState}
                actions={htmlPreviewState}
                user={user}
            />
        </div>
    );
}
```

### 5. Using with FullScreenOverlay

See `HtmlPreviewFullScreenExample.tsx` for a complete example:

```tsx
import FullScreenOverlay, { TabDefinition } from "@/components/official/FullScreenOverlay";
import { useHtmlPreviewState } from "./useHtmlPreviewState";
import { HtmlPreviewTab, HtmlCodeTab, SavePageTab } from "./tabs";

function MyFullScreenEditor({ isOpen, onClose, htmlContent }) {
    const user = useAppSelector(selectUser);
    const htmlPreviewState = useHtmlPreviewState({ htmlContent, user, isOpen });
    
    const tabs: TabDefinition[] = [
        {
            id: "preview",
            label: "Preview",
            content: (
                <HtmlPreviewTab
                    htmlContent={htmlContent}
                    state={htmlPreviewState}
                    actions={htmlPreviewState}
                    user={user}
                />
            ),
            className: "p-4"
        },
        // ... more tabs
    ];
    
    return (
        <FullScreenOverlay
            isOpen={isOpen}
            onClose={onClose}
            title="HTML Preview"
            tabs={tabs}
        />
    );
}
```

### 6. Using the Original Modal

The original `HtmlPreviewModal` remains unchanged and can still be used:

```tsx
import HtmlPreviewModal from "@/features/html-pages/components/HtmlPreviewModal";

function MyComponent() {
    const [isOpen, setIsOpen] = useState(false);
    
    return (
        <HtmlPreviewModal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            htmlContent="<h1>Hello World</h1>"
            title="HTML Preview"
        />
    );
}
```

## Available Tabs

### Markdown Editing Tabs

#### MarkdownSplitViewTab
TUI Editor split view - markdown on left, preview on right.

#### MarkdownWysiwygTab
TUI Editor WYSIWYG mode - rich text editing with markdown export.

#### MarkdownPlainTextTab
Simple textarea for plain text markdown editing.

#### MarkdownPreviewTab
Renders markdown with EnhancedChatMarkdown component.

### HTML Control Tab

#### HtmlControlsTab
Regenerate HTML from markdown and reset markdown to initial state.

### HTML Preview & Editing Tabs

#### HtmlCodeFilesTab
Multi-file code viewer and editor consolidating HTML Code, WordPress CSS, Complete HTML, and HTML editing into a single Monaco-based editor with file sidebar. Features:
- **content.html**: Generated HTML body content (read-only)
- **wordpress.css**: WordPress styling (read-only)
- **complete.html**: Full HTML document with embedded CSS (editable)
- Auto-formatting, syntax highlighting
- File tree navigation with color-coded icons
- Edit complete.html directly in the multi-file viewer

#### CustomCopyTab
Allows users to customize what gets copied (bullets, line breaks, etc.).

#### SavePageTab
**Publish & Update Metadata** - Shows the existing preview URL (auto-generated) with metadata editing. Features:
- Split view: Metadata form on left (with padding), live preview iframe on right
- **Preview controls**: Reset and Regenerate buttons (generates properly styled HTML with CSS)
- Pre-filled title and description from HTML extraction
- Unified fields (title and description update both page and meta tags)
- Shows current preview URL with copy/open actions
- All SEO fields visible (keywords, OG image, canonical URL)
- "Publish with Metadata" or "Update Metadata" button
- No duplicate pages created - uses existing preview URLs
- Replaces the old HTML Preview tab (includes preview controls + metadata)

---

**Note**: Several old tabs have been consolidated for a better experience:
- `HtmlCodeTab`, `WordPressCSSTab`, `CompleteHtmlTab`, and `EditHtmlTab` → **HtmlCodeFilesTab** (multi-file viewer/editor)
- `HtmlPreviewTab` → **SavePageTab/Publish** (preview now integrated with metadata editing)

## Type Definitions

All types are defined in `types.ts`:

- `HtmlPreviewState`: All state values
- `HtmlPreviewActions`: All actions and utility functions
- `HtmlPreviewHookProps`: Props for the hook
- `HtmlPreviewTabProps`: Props for tab components

## State Management

The hook manages:
- **Markdown content** (initialMarkdown, currentMarkdown)
- **HTML content** (generatedHtmlContent, editedCompleteHtml, wordPressCSS)
- **HTML state** (isHtmlDirty - tracks when HTML needs regeneration)
- **Preview URLs** (originalPageUrl, regeneratedPageUrl - smart URL management)
- Copy states (copied, copiedNoBullets, copiedCSS, etc.)
- Custom copy options (includeBulletStyles, includeDecorativeLineBreaks)
- Save page metadata (pageTitle, pageDescription, metaTitle, etc.)
- Loading states (isCreating, error)

### Smart URL Management

The system maintains up to two preview URLs:

1. **originalPageUrl**: Created automatically on first open (one-time only)
2. **regeneratedPageUrl**: Created when user clicks "Regenerate" after editing

The `getCurrentPreviewUrl()` utility returns `regeneratedPageUrl` if it exists, otherwise falls back to `originalPageUrl`. This prevents duplicate page creation and allows efficient preview management.

## Actions

The hook provides these actions:

**Markdown Actions:**
- `handleRegenerateHtml()`: Convert current markdown to HTML and create new preview page
- `handleRefreshMarkdown()`: Reset markdown to initial state and use original preview URL

**HTML Actions:**
- `handleCopyHtml()`: Copy HTML to clipboard
- `handleCopyHtmlNoBullets()`: Copy HTML without bullet styles
- `handleCopyCSS()`: Copy WordPress CSS
- `handleCopyComplete()`: Copy complete HTML document
- `handleCopyCustom()`: Copy with custom options
- `handleCopyUrl()`: Copy saved page URL
- `handleSavePage()`: Save page to database (stores URL to prevent recreation)

## Utility Functions

The hook provides these utilities:
- `generateCompleteHTML()`: Generate full HTML document
- `getCurrentHtmlContent()`: Get current (possibly edited) HTML
- `getCurrentPreviewUrl()`: Get current preview URL (regenerated or original)
- `extractBodyContent()`: Extract body from complete HTML
- `stripBulletStyles()`: Remove bullet style classes
- `stripDecorativeLineBreaks()`: Remove decorative HR elements
- `applyCustomOptions()`: Apply custom copy options
- `extractTitleFromHTML()`: Extract title from HTML
- `extractDescriptionFromHTML()`: Extract description from HTML
- `getCharacterCountStatus()`: SEO character count helper
- `getSEORecommendation()`: SEO recommendation helper

## Dependencies

- React
- lucide-react (icons)
- @/components/mardown-display/code/SmallCodeEditor
- @/components/matrx/buttons/markdown-copy-utils
- @ai-matrx/print/markdown
- @/features/html-pages/hooks/useHTMLPages
- @/lib/redux/hooks (for user selector)

## Best Practices

1. **Always use the hook**: Don't manage state independently
2. **Pass user**: Required for save functionality
3. **Set isOpen correctly**: The hook uses this to load CSS and initialize state
4. **Preserve htmlContent prop**: Always pass the original HTML content to tabs
5. **Handle errors**: The hook provides error state and clearError function

## Migration Guide

If you want to migrate from `HtmlPreviewModal` to the new tabs:

1. Create the hook instance:
   ```tsx
   const htmlPreviewState = useHtmlPreviewState({ htmlContent, user, isOpen });
   ```

2. Replace the modal with individual tabs or FullScreenOverlay

3. Pass state and actions to each tab

4. No need to change any existing code that uses `HtmlPreviewModal`

## Testing

All tab components:
- ✅ Are free of linter errors
- ✅ Have proper TypeScript types
- ✅ Use consistent styling (light/dark mode support)
- ✅ Follow the project's code style guidelines
- ✅ Are modular and reusable

