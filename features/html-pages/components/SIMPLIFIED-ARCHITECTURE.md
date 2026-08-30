# HTML Preview System - Simplified Architecture

## Overview
Complete refactor to eliminate complexity, race conditions, and automatic page creation.

## Simple Flow

### 1. Component Load
- Markdown content is loaded and stored as `initialMarkdown` (never changes)
- When editor opens (`isOpen = true`), markdown syncs to `currentMarkdown` (local state only)
- HTML is generated from markdown (local state only)
- **NO automatic page creation to database**
- **NO auto-generation to database**

### 2. User Goes to Publish Tab
- No preview initially (no URL yet)
- User fills in metadata (title, description, etc.)

### 3. First Generation (Create)
- User clicks "Generate" button
- System creates a new HTML page in database
- Receives `publishedPageId` and `publishedPageUrl`
- ID is stored in parent component (`ResponseLayoutManager`)
- **ONE PAGE ONLY - this ID never changes**

### 4. Subsequent Operations (Update)
All operations now UPDATE the same page:

#### Regenerate
- Takes current HTML content (from markdown or direct HTML edits)
- **UPDATES** existing page using `publishedPageId`
- Never creates a new page

#### Reset
- Reverts `currentMarkdown` to `initialMarkdown`
- Regenerates HTML from initial content (local only)
- User must click "Regenerate" to update database

#### Markdown Edits
- Updates `currentMarkdown` (local state)
- Sets `isMarkdownDirty = true`
- Does NOT affect database until user clicks "Regenerate"

#### HTML Edits
- Updates `editedCompleteHtml` (local state)
- Sets `isHtmlDirty = true`
- Does NOT affect database until user clicks "Regenerate"

## State Management

### Single Sources of Truth

**Markdown:**
- `initialMarkdown`: Original content (never changes)
- `currentMarkdown`: Edited content (can be reset to initial)

**HTML:**
- `generatedHtmlContent`: Generated from current markdown
- `editedCompleteHtml`: Direct HTML edits (takes precedence)

**Database:**
- `publishedPageId`: Single page ID (from parent component)
- `publishedPageUrl`: Single URL (updated on generate/regenerate)

### Dirty State Tracking
- `isMarkdownDirty`: True when markdown is edited
- `isHtmlDirty`: True when HTML is directly edited
- Both cleared when "Regenerate" is clicked

## What Was Removed

### Eliminated Complexity
1. ❌ Automatic page creation on component mount
2. ❌ `isCreatingPage` ref and race condition locks
3. ❌ `originalPageUrl` vs `regeneratedPageUrl` distinction
4. ❌ Multiple useEffect hooks that auto-create pages
5. ❌ Complex dependency management
6. ❌ `try-catch` fallbacks for stale IDs

### Simplified to
1. ✅ One `publishedPageUrl` (single source of truth)
2. ✅ Simple create OR update logic in `handleRegenerateHtml`
3. ✅ No auto-generation (user-triggered only)
4. ✅ Clean state management

## Key Functions

### `handleRegenerateHtml(useMetadata?: boolean)`
**Unified function for ALL page operations**

```typescript
// Create if no ID, Update if ID exists
// useMetadata=true: Uses metadata from Publish tab (title, description, SEO)
// useMetadata=false: Quick update without metadata (for Regenerate button)

if (publishedPageId) {
    result = await updateHTMLPage(publishedPageId, content, title, desc, metaFields);  // UPDATE
} else {
    result = await createHTMLPage(content, title, desc, metaFields);  // CREATE
    onPageIdChange?.(result.pageId);  // Notify parent
}

setPublishedPageUrl(result.url);  // Single URL
```

### `handleSavePage()`
**Publish button - Uses metadata**
```typescript
// Validates title, then calls unified function with metadata
await handleRegenerateHtml(true);  // useMetadata=true
```

### `handleRefreshMarkdown()`
**Reset button - Local only**
```typescript
// Revert to initial markdown (local state only)
setCurrentMarkdown(initialMarkdown);
setGeneratedHtmlContent(markdownToHtml(initialMarkdown)); // @ai-matrx/print/markdown
// Does NOT update database
```

## Publish Tab - Three Buttons, One Function

All three buttons use the same unified `handleRegenerateHtml()` function:

### **1. Generate/Update Page** (Main Button)
- **When**: User wants to publish with full metadata
- **Calls**: `handleRegenerateHtml(true)` 
- **Uses**: Title, description, SEO fields, keywords, OG image, etc.
- **First time**: Creates page → stores ID
- **Subsequent**: Updates same page with new metadata

### **2. Regenerate** (Preview button)
- **When**: User edited markdown/HTML and wants quick preview update
- **Calls**: `handleRegenerateHtml()` (defaults to false)
- **Uses**: Current content only (no metadata update)
- **Disabled**: When no page exists OR content unchanged
- **Purpose**: Quick content-only updates without metadata

### **3. Reset** (Preview button)
- **When**: User wants to revert to original content
- **Calls**: `handleRefreshMarkdown()` (local only)
- **Does NOT**: Update database
- **Disabled**: When no page exists
- **Purpose**: Undo local edits, then user clicks Regenerate to publish

## Benefits

1. **No Duplicate Pages**: Single unified function, single page ID
2. **No Race Conditions**: Removed all complex locking mechanisms
3. **Clear Flow**: User controls when pages are created/updated
4. **Single Source of Truth**: One ID, one URL, one page
5. **Consistent Metadata**: All operations use same metadata fields
6. **Predictable Behavior**: No automatic operations
7. **Easier to Debug**: Simple, linear flow

## State Reset for New Tasks

When a new task completes (different content), all HTML preview state is reset:

### Parent Component (`ResponseLayoutManager`)
```typescript
const [hookResetKey, setHookResetKey] = useState(0);

useEffect(() => {
    if (isTaskComplete) {
        setPublishedPageId(null);        // Clear page ID
        setHookResetKey(prev => prev + 1); // Increment reset key
    }
}, [isTaskComplete, taskId]);

// Pass resetKey to hook
const htmlPreviewState = useHtmlPreviewState({
    // ... other props
    resetKey: hookResetKey
});
```

### Hook Behavior
When `resetKey` changes:
1. Clears `publishedPageUrl` and `savedPage`
2. Resets dirty flags (`isMarkdownDirty`, `isHtmlDirty`)
3. Clears all metadata fields (title, description, SEO)
4. Clears edited HTML content
5. Parent resets `publishedPageId` separately

**Result**: Completely fresh state for new content, preventing cross-contamination between tasks.

## Testing Checklist

- [ ] Open editor → No page created
- [ ] Go to Publish tab → No preview (no URL yet)
- [ ] Click "Generate" → Creates page ONCE
- [ ] Edit markdown → Local only
- [ ] Click "Regenerate" → Updates same page
- [ ] Click "Reset" → Reverts to initial (local)
- [ ] Click "Regenerate" after reset → Updates same page
- [ ] Close and reopen editor → Same page ID preserved
- [ ] Complete new task → All state resets, new page ID on next generation

## File Changes

### Modified Files
- `features/html-pages/components/useHtmlPreviewState.ts` (major cleanup)
- `features/html-pages/components/types.ts` (updated interfaces)
- `features/applet/runner/response/ResponseLayoutManager.tsx` (removed debug logs)

### Lines Removed
- ~60 lines of auto-creation logic
- ~30 lines of race condition handling
- ~20 lines of complex state management

### Net Result
- **Simpler codebase**
- **More predictable behavior**
- **Easier to maintain**

