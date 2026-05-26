# Google Search Console Integration

A complete Google Search Console analytics interface with OAuth authentication.

## Features

- ✅ **OAuth Authentication** - Secure Google Sign-In with Search Console scopes
- ✅ **Property Management** - View and select from all your verified properties
- ✅ **Performance Metrics** - Total clicks, impressions, CTR, and average position
- ✅ **Top Queries** - See which search queries drive traffic
- ✅ **Top Pages** - Identify your best-performing pages
- ✅ **Geographic Data** - View performance by country
- ✅ **Device Breakdown** - Desktop, mobile, and tablet analytics
- ✅ **Flexible Date Ranges** - Last 7/28/90/180 days or custom ranges
- ✅ **Real-time Data** - Refresh anytime to get latest stats

## Directory Structure

```
search-console/
├── page.tsx                          # Main page with auth flow
├── types.ts                          # TypeScript type definitions
├── README.md                         # This file
├── hooks/
│   └── useSearchConsole.ts          # API calls hook
└── components/
    ├── PropertySelector.tsx         # Property selection UI
    ├── SearchAnalytics.tsx          # Main analytics container
    ├── PerformanceMetrics.tsx       # Summary metrics cards
    ├── DataTable.tsx                # Reusable data table
    └── DateRangeSelector.tsx        # Date range picker
```

## Usage

1. Navigate to `/tests/google-apis/search-console`
2. Click "Sign In with Google"
3. Authorize Search Console access
4. Select a property from your list
5. View analytics data across multiple dimensions
6. Adjust date range as needed
7. Click tabs to switch between Queries, Pages, Countries, and Devices

## Authentication

Uses the existing `GoogleAPIProvider` with the following scope:
- `https://www.googleapis.com/auth/webmasters.readonly` - Read-only access to Search Console data

The token is managed by the provider and passed to components as needed.

## API Integration

The `useSearchConsoleAPI` hook provides two main methods:

### 1. Fetch Properties
```typescript
const properties = await fetchProperties();
// Returns: SiteProperty[]
```

### 2. Fetch Analytics
```typescript
const data = await fetchAnalytics(siteUrl, {
    startDate: "2024-01-01",
    endDate: "2024-01-31",
    dimensions: ["query"],
    rowLimit: 100
});
// Returns: SearchAnalyticsResponse
```

## Data Storage

Currently uses:
- **OAuth Token**: Stored in localStorage by GoogleAPIProvider
- **Selected Property**: Component state (can be moved to cookies/database)
- **Date Range**: Component state (can be persisted)

### Future Database Schema

```typescript
// For storing user preferences
interface UserSearchConsolePreferences {
    userId: string;
    defaultProperty: string;
    defaultDateRange: number; // days
    favoriteProperties: string[];
}

// For caching analytics data
interface SearchConsoleCache {
    property: string;
    dateRange: string;
    dimension: string;
    data: SearchAnalyticsResponse;
    cachedAt: Date;
    expiresAt: Date;
}
```

## Components

### PropertySelector
Displays all verified properties and allows selection. Auto-selects the first property on load.

### PerformanceMetrics
Shows 4 key metrics:
- 📊 Total Clicks
- 👁️ Total Impressions  
- 📈 Average CTR
- 🎯 Average Position

### DataTable
Reusable table component that displays:
- Query/Page/Country/Device name
- Clicks, Impressions, CTR, Position
- Clickable links for pages
- Formatted numbers and percentages

### DateRangeSelector
Dropdown with:
- Quick presets (7/28/90/180 days)
- Custom date pickers
- Date validation

## API Limits

Google Search Console API has the following limits:
- **Queries per day**: 200 (default)
- **Queries per 100 seconds**: 600
- **Max rows per request**: 25,000
- **Data freshness**: Usually 2-3 days old

## Next Steps

1. **✅ Done** - Basic OAuth & data fetching
2. **Future** - Add charts/graphs for trends
3. **Future** - Export data to CSV/Excel
4. **Future** - Save preferences to database
5. **Future** - Add comparison periods
6. **Future** - Set up automated reports
7. **Future** - LLM analysis integration (similar to PageSpeed)

## Troubleshooting

### "Sign In Required"
- User needs to authenticate with Google
- Click "Sign In with Google" button

### "Missing required permissions"
- Re-authenticate to grant webmasters scope
- Click "Re-authenticate" button

### "No properties found"
- User needs to add a site to Search Console first
- Visit [Google Search Console](https://search.google.com/search-console)

### "No data available"
- Property might be too new (needs 2-3 days of data)
- Try a different date range
- Check if property has any traffic

## Resources

- [Search Console API Documentation](https://developers.google.com/webmaster-tools/search-console-api-original/v3)
- [OAuth 2.0 Scopes](https://developers.google.com/identity/protocols/oauth2/scopes#webmasters)
- [Google Search Console](https://search.google.com/search-console)

