# Canvas Persistence System - Production Roadmap

## 🚨 Critical Issues (Fix First)

### Deduplication Problems
- [ ] **Debug why duplicates are being saved despite content hashing**
  - Check if `content_hash` is being generated correctly
  - Verify hash comparison logic in `canvasItemsService.save()`
  - Test with identical quiz content to ensure only one is saved
  - Add logging to see what hashes are being generated
  - Ensure the hash doesn't include dynamic fields (timestamps, IDs)

- [ ] **Fix hash generation to be deterministic**
  - Current implementation might have ordering issues with JSON.stringify
  - Consider sorting object keys before hashing
  - Test with same content in different order
  - Add unit tests for hash generation

- [ ] **Add unique constraint enforcement**
  - Verify database migration ran successfully
  - Check that `canvas_items_user_content_unique` index exists
  - Test constraint by trying to insert duplicate via SQL
  - Handle constraint violation errors gracefully in UI

### Source Tracking Issues
- [ ] **Connect canvas items to their originating messages**
  - When AI generates canvas content, capture `message_id` from chat
  - Pass `source_message_id` to `openCanvas()` action
  - Store in Redux `CanvasItem.sourceMessageId`
  - Pass to `canvasItemsService.save()` when syncing
  - Verify it's being saved to database

- [ ] **Connect canvas items to chat sessions**
  - Determine how to get current `session_id` (chat conversation ID)
  - Pass `session_id` when opening canvas from chat
  - Store in database for filtering (e.g., "Show all from this chat")
  - Add "View in Chat" link in library to jump back to originating message

- [ ] **Connect canvas items to socket tasks**
  - When AI task completes, capture `task_id`
  - Pass `task_id` from AI response handler
  - Store in `CanvasItem` metadata
  - Use for deduplication check: "Was this task already saved?"
  - Add `getByTaskId()` lookup for auto-recovery

- [ ] **Test full source tracking flow**
  - User sends prompt → AI responds → Canvas opens
  - Verify `source_message_id`, `session_id`, and `task_id` are captured
  - Click sync → Verify all three fields saved to database
  - Reload page → Verify can trace back to original chat message

---

## 🔧 Core Functionality Fixes

### Auto-Save & Sync Behavior
- [ ] **Decide on auto-save vs manual save strategy**
  - Option 1: Auto-save every canvas item immediately when AI creates it
  - Option 2: Manual save only (current behavior)
  - Option 3: Hybrid (auto-save but allow user to delete before syncing)
  - Document decision in README

- [ ] **Implement auto-save if chosen**
  - Add setting in user preferences: "Auto-save canvas items"
  - Auto-call `canvasItemsService.save()` in `openCanvas` action
  - Show subtle toast: "Auto-saved to library"
  - Mark as synced immediately in Redux

- [ ] **Add "Unsaved changes" indicator**
  - Track if current canvas content has been modified since last save
  - Show yellow dot or "Unsaved" badge in header
  - Prompt before closing canvas with unsaved changes
  - Add "Save & Close" vs "Close without saving" options

- [ ] **Improve sync button feedback**
  - Change icon based on state: CloudOff → CloudSync (spinning) → Cloud (green)
  - Add progress indicator for large content
  - Show error state if save fails (red CloudOff with X)
  - Add retry button on failure

### Deduplication UX
- [ ] **Improve duplicate detection messaging**
  - Instead of "Already saved", show: "Found existing copy from [date]"
  - Add "View existing" button in toast
  - Add "Save as new copy" option if user really wants duplicate
  - Show diff preview if content differs slightly

- [ ] **Add duplicate merge/replace options**
  - If duplicate found, ask: "Replace existing?" or "Keep both?"
  - If "Replace", update existing item's content
  - If "Keep both", allow save with different title
  - Store version history (optional future feature)

### Canvas Item Metadata
- [ ] **Improve auto-generated titles**
  - For quizzes: Extract first question or topic
  - For iframes: Extract page title from URL or meta tags
  - For recipes: Use recipe name
  - For slideshows: Use first slide title
  - Fallback to current behavior if extraction fails

- [ ] **Add automatic description generation**
  - For quizzes: "10 questions about Biology"
  - For iframes: Show domain and page title
  - For recipes: Show cuisine type or meal category
  - Store in `description` field automatically

- [ ] **Capture thumbnail/preview images**
  - Add `thumbnail_url` field to database schema
  - Generate screenshot of canvas content (use html2canvas or similar)
  - Upload to `cld_files` via the universal file handler (`fileHandler.upload`)
  - Display in library grid for visual browsing

---

## 📊 Data Management & Organization

### Categories & Tags
- [ ] **Implement smart auto-tagging**
  - For quizzes: Extract subject tags from question content
  - For recipes: Add cuisine type, meal type, dietary restrictions
  - For code: Add language tags
  - Store in `tags[]` array automatically

- [ ] **Add manual tag management**
  - Tag editor UI in library (click to add/remove tags)
  - Tag autocomplete from existing tags
  - Tag-based filtering in library
  - Color-coded tag badges

- [ ] **Add folder/collection system**
  - New table: `canvas_collections` with `user_id`, `name`, `description`
  - Junction table: `canvas_collection_items` linking items to collections
  - UI to create collections and add items
  - Filter library by collection

### Search & Filtering
- [ ] **Improve search functionality**
  - Add full-text search on title + description + content
  - Search within quiz questions, recipe ingredients, etc.
  - Highlight search matches in results
  - Add search suggestions/autocomplete

- [ ] **Add advanced filters**
  - Date range filter (created, updated, accessed)
  - Multiple type selection (Quiz + Slideshow)
  - Favorite + Not Archived combined filters
  - Source filter (from specific chat session)
  - Custom filter builder UI

- [ ] **Add sorting options**
  - Sort by: Recently created, Recently accessed, Title A-Z, Type
  - Sort direction toggle (ascending/descending)
  - Remember user's preferred sort
  - Add "Sort by relevance" for search results

### Bulk Operations
- [ ] **Add multi-select mode**
  - Checkbox on each card in library
  - "Select All" / "Select None" buttons
  - Show count: "3 items selected"
  - Actions bar when items selected

- [ ] **Implement bulk actions**
  - Bulk delete with confirmation
  - Bulk archive/unarchive
  - Bulk tag addition/removal
  - Bulk move to collection
  - Export selected items as JSON

---

## 🎨 UX Improvements

### Library View Enhancements
- [ ] **Add view mode toggle**
  - Grid view (current)
  - List view (compact, more info per row)
  - Timeline view (grouped by date)
  - Remember user preference

- [ ] **Improve card design**
  - Add hover preview (expand card on hover)
  - Show more metadata (size, question count, etc.)
  - Add quick actions on hover (no need to click into card)
  - Show "Last viewed" timestamp

- [ ] **Add empty state improvements**
  - Show "Get started" tutorial for first-time users
  - Add "Create sample items" button to populate with examples
  - Show tips: "Canvas items are created by AI responses"
  - Add link to documentation

### Navigation & Discovery
- [ ] **Add "Recent Items" section**
  - Show 5 most recently accessed items at top of library
  - Quick access without scrolling
  - Separate from main grid

- [ ] **Add "Favorites" quick access**
  - Starred items shown first
  - Collapsible "Favorites" section
  - Pin to top of library

- [ ] **Add "From this chat" filter in canvas**
  - When canvas opened from chat, show filter button
  - Click to see only items from current conversation
  - Helps users find related content

### Interaction Polish
- [ ] **Add keyboard shortcuts**
  - `L` to toggle library view
  - `S` to sync current item
  - `F` to favorite current item
  - `/` to focus search in library
  - `Esc` to close canvas

- [ ] **Add drag-and-drop**
  - Drag items to reorder in custom sort
  - Drag to collections/folders
  - Drag to trash (with undo)

- [ ] **Improve loading states**
  - Skeleton cards while loading library
  - Progressive loading (load first 20, then infinite scroll)
  - Optimistic UI updates for all actions

---

## 🔐 Data Integrity & Sync

### Conflict Resolution
- [ ] **Handle concurrent edits**
  - Detect if item was modified by another device
  - Show conflict resolution UI
  - Options: Keep local, Keep remote, Merge
  - Store last sync timestamp for comparison

- [ ] **Add offline support**
  - Cache canvas items in IndexedDB
  - Allow viewing/editing offline
  - Queue sync operations
  - Sync when connection restored

### Data Migration & Cleanup
- [ ] **Add data export feature**
  - Export all items as JSON
  - Export selected items
  - Include metadata and full content
  - Download as file

- [ ] **Add data import feature**
  - Import from JSON export
  - Validate data structure
  - Handle duplicates on import
  - Show preview before importing

- [ ] **Implement automatic cleanup**
  - Setting: "Auto-archive items older than X days"
  - Setting: "Auto-delete archived items after Y days"
  - Confirmation before auto-deletion
  - Exclusion for favorited items

### Version History (Future)
- [ ] **Design version system**
  - New table: `canvas_item_versions`
  - Store previous versions on update
  - Limit to last 10 versions per item
  - Add "View history" button in library

- [ ] **Implement version restore**
  - Show diff between versions
  - "Restore this version" button
  - Create new version on restore (don't delete current)

---

## 🔗 Sharing & Collaboration

### Share Improvements
- [ ] **Add share settings**
  - Allow comments on shared items (new table)
  - Allow remixing/forking shared items
  - Set expiration date for share links
  - Password-protect shares (optional)

- [ ] **Improve share page**
  - Add "Open Graph" meta tags for social media previews
  - Add "Save a copy" button for authenticated users
  - Show author name (if user opts in)
  - Add view counter

- [ ] **Add share analytics**
  - Track view count per shared item
  - Track unique visitors
  - Show in library: "Viewed 42 times"
  - Add "Popular" badge for highly viewed items

### Collaboration Features (Future)
- [ ] **Add real-time collaboration**
  - Multiple users can view/edit same item
  - Show presence indicators (who's viewing)
  - Cursor positions for co-editors
  - Real-time updates via Supabase Realtime

- [ ] **Add permissions system**
  - Table: `canvas_collaborators` with user_id + permission level
  - Permissions: view, comment, edit, admin
  - Share with specific users (not just public link)
  - Manage collaborators in UI

---

## 🧪 Testing & Quality

### Automated Tests
- [ ] **Write unit tests**
  - Test `generateContentHash()` determinism
  - Test deduplication logic
  - Test all service methods
  - Test Redux actions and selectors

- [ ] **Write integration tests**
  - Test full save flow (open → sync → load)
  - Test duplicate detection flow
  - Test library filtering and search
  - Test sharing flow end-to-end

- [ ] **Add E2E tests**
  - Test AI creates canvas → user syncs → appears in library
  - Test share link generation → open in incognito → view
  - Test edit title → sync → reload → title persisted

### Manual Testing Checklist
- [ ] **Test deduplication**
  - Create identical quiz twice
  - Verify only one saved
  - Verify "Already saved" message appears
  - Verify timestamp updated on duplicate attempt

- [ ] **Test source tracking**
  - Create item from chat
  - Verify message ID captured
  - Verify session ID captured
  - Verify task ID captured
  - Check database record has all fields

- [ ] **Test library features**
  - Search returns correct results
  - Filters work correctly
  - Sort orders work
  - All actions work (favorite, archive, delete, share)

- [ ] **Test edge cases**
  - Very large content (1000+ questions)
  - Special characters in titles
  - Network failures during sync
  - Browser refresh during sync

---

## 📈 Performance & Scalability

### Database Optimization
- [ ] **Add missing indexes**
  - Index on `session_id` for filtering
  - Index on `created_at` for sorting
  - Composite index on `user_id + type` for type filtering
  - Full-text search index on title

- [ ] **Optimize queries**
  - Use `.select()` to fetch only needed columns
  - Implement pagination (20 items per page)
  - Add cursor-based pagination for infinite scroll
  - Cache frequently accessed items

### Frontend Performance
- [ ] **Implement virtualization**
  - Use `react-window` for large lists
  - Only render visible cards
  - Dramatically improves performance with 1000+ items

- [ ] **Add lazy loading**
  - Load thumbnails on demand
  - Lazy load canvas content until viewed
  - Use intersection observer for card visibility

- [ ] **Optimize bundle size**
  - Code-split library view (don't load until needed)
  - Lazy load share page
  - Dynamic imports for large dependencies

---

## 📱 Mobile & Responsive

### Mobile Optimization
- [ ] **Improve mobile library view**
  - Single column grid on mobile
  - Larger touch targets
  - Swipe actions (swipe to delete/archive)
  - Pull-to-refresh

- [ ] **Mobile share page**
  - Full-screen mobile view
  - Native share button (Web Share API)
  - Mobile-optimized controls

- [ ] **Touch gestures**
  - Pinch to zoom on canvas content
  - Swipe to navigate between items
  - Long-press for context menu

---

## 🔍 Debugging & Monitoring

### Developer Tools
- [ ] **Add debug mode**
  - Show content hashes in UI
  - Show all metadata in dev panel
  - Log all sync operations
  - Show Redux state inspector

- [ ] **Add error tracking**
  - Integrate Sentry or similar
  - Track failed sync operations
  - Track deduplication failures
  - Alert on high error rates

### User Analytics
- [ ] **Track usage metrics**
  - Canvas open rate
  - Sync rate (how many items saved)
  - Library view frequency
  - Most popular canvas types

- [ ] **Add feedback mechanism**
  - "Report a problem" button
  - "Was this helpful?" on saved items
  - User satisfaction survey
  - Feature request form

---

## 📚 Documentation

### User Documentation
- [ ] **Write user guide**
  - "How to save canvas items"
  - "How to organize your library"
  - "How to share items"
  - "How to search and filter"

- [ ] **Create video tutorials**
  - Quick start guide (2 min)
  - Library management (5 min)
  - Advanced features (10 min)

### Developer Documentation
- [ ] **Update API documentation**
  - Document all service methods
  - Add code examples
  - Document Redux integration
  - Add architecture diagrams

- [ ] **Write migration guide**
  - How to upgrade existing installations
  - Database migration instructions
  - Breaking changes (if any)

---

## 🚀 Deployment

### Pre-Launch Checklist
- [ ] **Run all database migrations**
  - Verify migrations ran successfully
  - Check all indexes created
  - Verify RLS policies active
  - Test with production data

- [ ] **Performance testing**
  - Test with 1000+ items in library
  - Measure sync operation time
  - Test concurrent user load
  - Verify database query performance

- [ ] **Security audit**
  - Verify RLS prevents unauthorized access
  - Test share token security
  - Check for SQL injection vulnerabilities
  - Verify CSRF protection

- [ ] **Browser compatibility**
  - Test on Chrome, Firefox, Safari, Edge
  - Test on iOS Safari
  - Test on Android Chrome
  - Fix any browser-specific issues

### Launch Plan
- [ ] **Soft launch (internal)**
  - Deploy to staging
  - Test with team
  - Fix critical bugs
  - Gather feedback

- [ ] **Beta launch (select users)**
  - Deploy to production with feature flag
  - Monitor error rates
  - Gather user feedback
  - Iterate based on feedback

- [ ] **Full launch**
  - Enable feature for all users
  - Announce in changelog
  - Monitor metrics closely
  - Provide support for issues

---

## 🎯 Priority Order

### Week 1: Critical Fixes
1. ✅ Fix deduplication issues
2. ✅ Fix source tracking (message_id, session_id, task_id)
3. ✅ Test full flow end-to-end
4. ✅ Add proper error handling

### Week 2: Core Functionality
1. ⏳ Decide on auto-save strategy
2. ⏳ Improve sync button feedback
3. ⏳ Add unsaved changes indicator
4. ⏳ Improve auto-generated titles

### Week 3: UX Polish
1. ⏳ Add tags and collections
2. ⏳ Improve search and filtering
3. ⏳ Add bulk operations
4. ⏳ Polish library view

### Week 4: Testing & Launch Prep
1. ⏳ Write tests
2. ⏳ Performance optimization
3. ⏳ Documentation
4. ⏳ Soft launch

---

## 🐛 Known Issues to Investigate

1. **Duplicate Saves**
   - Currently saving multiple copies of same content
   - Need to debug hash generation
   - Check if constraint is working

2. **Missing Source Connections**
   - `source_message_id` not being passed from chat
   - `session_id` not captured
   - `task_id` not linked to AI tasks

3. **Library Performance**
   - Slow with many items (need pagination)
   - Search could be faster (need full-text index)

4. **Mobile Issues**
   - Library cards too small on mobile
   - Share page not mobile-optimized

---

## 💡 Nice-to-Have Features (Future)

- [ ] AI-powered auto-categorization
- [ ] Smart duplicate detection (fuzzy matching)
- [ ] Canvas templates library
- [ ] Public gallery of shared items
- [ ] Export to PDF/PNG
- [ ] Integration with other apps (Notion, Google Drive)
- [ ] Canvas item comments/notes
- [ ] Collaboration features
- [ ] Version history
- [ ] Activity feed ("You created 5 quizzes this week")

---

**Total Tasks:** ~150+
**Estimated Time:** 3-4 weeks for MVP, 2-3 months for full feature set
**Priority:** Focus on Critical Fixes and Core Functionality first

**Next Steps Tomorrow:**
1. Debug deduplication (why are duplicates being saved?)
2. Fix source tracking (capture message_id, session_id, task_id)
3. Test with real chat data
4. Verify all database fields are being populated

