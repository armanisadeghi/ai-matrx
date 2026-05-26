# Prompt Apps Administration

Complete admin interface system for managing the Prompt Apps feature.

## Overview

This admin module provides comprehensive tools for managing all aspects of the Prompt Apps system, including categories, app moderation, error tracking, analytics, and rate limiting.

## Features

### 1. Categories Management
**Path:** `/administration/prompt-apps` → Categories Tab

**Features:**
- Full CRUD operations for prompt app categories
- Icon support (Lucide React icons)
- Sort order management with up/down arrows
- Real-time preview of selected icon
- Slug-based ID system for URL-friendly identifiers

**Fields:**
- `id` (string): Unique identifier, cannot be changed after creation
- `name` (string): Display name of the category
- `description` (text): Optional description
- `icon` (string): Lucide React icon name (e.g., "Sparkles", "Zap")
- `sort_order` (integer): Display order

### 2. Apps Management
**Path:** `/administration/prompt-apps` → Apps Tab

**Features:**
- View all prompt apps with filtering
- Feature/unfeature apps (star badge)
- Verify/unverify apps (shield badge)
- Change app status (draft, published, archived, suspended)
- View app statistics (executions, users, success rate, cost)
- Link to public app page

**Filters:**
- Search by name, slug, or creator email
- Filter by status
- Filter by featured/not featured
- Filter by verified/not verified

**Actions:**
- Change status via dropdown
- Toggle featured status
- Toggle verified status
- View app details

### 3. Error Management
**Path:** `/administration/prompt-apps` → Errors Tab

**Features:**
- View all execution errors
- Filter by error type and resolution status
- Detailed error inspection dialog
- Mark errors as resolved with notes
- View variables sent vs expected
- Track resolution history

**Error Types:**
- Missing Variable
- Extra Variable
- Invalid Variable Type
- Component Render Error
- API Error
- Rate Limit
- Other

**Error Details:**
- Error message and code
- Variables sent vs expected
- Error details JSON
- App information with link
- Timestamps and resolution notes

### 4. Analytics Dashboard
**Path:** `/administration/prompt-apps` → Analytics Tab

**Features:**
- System-wide overview cards:
  - Total executions across all apps
  - Unique users (anonymous + authenticated)
  - Overall success rate
  - Total cost and tokens
- Per-app detailed metrics:
  - Executions (total, 24h, 7d, 30d)
  - Success rate with visual indicators
  - Average execution time
  - Cost breakdown
  - User counts (anonymous vs authenticated)
  - Performance percentiles (p50, p95)
  - Activity status badge

### 5. Rate Limits Management
**Path:** `/administration/prompt-apps` → Rate Limits Tab

**Features:**
- View all rate limit entries
- Filter by blocked/not blocked status
- Unblock users/IPs/fingerprints
- View execution counts and windows
- Track block reasons and expiration

**Identifiers:**
- User ID (authenticated users)
- IP Address (network-based)
- Browser Fingerprint (anonymous users)

**Details:**
- Execution count in current window
- First/last execution timestamps
- Window start time
- Block status and reason
- Block expiration time

## Service Layer

**File:** `lib/services/prompt-apps-admin-service.ts`

Provides all database operations:

### Categories
- `fetchCategories()` - Get all categories
- `getCategoryById(id)` - Get single category
- `createCategory(input)` - Create new category
- `updateCategory(input)` - Update category
- `deleteCategory(id)` - Delete category

### Apps
- `fetchAppsAdmin(filters?)` - Get all apps with filters
- `updateAppAdmin(input)` - Update app admin fields

### Errors
- `fetchErrors(filters?)` - Get errors with filters
- `resolveError(input)` - Mark error as resolved
- `unresolveError(id)` - Mark error as unresolved

### Rate Limits
- `fetchRateLimits(filters?)` - Get rate limits with filters
- `unblockRateLimit(id)` - Unblock a rate limit
- `blockRateLimit(id, reason?, until?)` - Block a rate limit

### Analytics
- `fetchAnalytics(filters?)` - Get analytics data from view

## Database Tables

### prompt_app_categories
Primary table for managing categories shown in the public app browser.

### prompt_apps
Main apps table with admin-modifiable fields:
- `status` - Draft, Published, Archived, Suspended
- `is_verified` - Admin verification badge
- `is_featured` - Featured in app browser

### prompt_app_errors
Tracks execution errors for debugging and monitoring.

### prompt_app_executions
Log of all app executions (read-only in admin).

### prompt_app_rate_limits
Rate limiting records for users, IPs, and fingerprints.

### prompt_app_analytics (VIEW)
Aggregated analytics data with performance metrics.

## Navigation

The admin module is accessible via:
1. `/administration` main menu
2. "Prompt Apps" menu item
3. Tabbed interface for all sub-features

## UI Patterns

Following established admin patterns:
- Sidebar + main content layout (Categories)
- List view with filters (Apps, Errors, Rate Limits)
- Dashboard with cards (Analytics)
- Detail dialogs for inspection
- Inline editing where appropriate
- Confirmation dialogs for destructive actions
- Toast notifications for all actions

## Tech Stack

- **Framework:** Next.js 15 App Router
- **UI Components:** ShadCN UI (Dialog, Card, Tabs, etc.)
- **Icons:** Lucide React
- **Database:** Supabase PostgreSQL
- **State:** React hooks (no Redux needed)
- **Styling:** Tailwind CSS

## Usage

1. Navigate to `/administration/prompt-apps`
2. Use tabs to switch between sections
3. Apply filters as needed
4. Perform CRUD operations
5. Monitor analytics and errors
6. Manage rate limits and blocks

## Best Practices

1. **Categories:** Keep IDs lowercase and hyphenated for URL-friendly slugs
2. **Apps:** Review apps before featuring or verifying
3. **Errors:** Regularly review and resolve errors to improve app quality
4. **Analytics:** Monitor for unusual patterns or performance issues
5. **Rate Limits:** Only unblock after investigating the cause

## Future Enhancements

Potential additions:
- Bulk operations for apps and errors
- Export analytics data
- Custom date range filters for analytics
- Email notifications for critical errors
- Rate limit rule configuration
- Category usage statistics

