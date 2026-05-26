# Google PageSpeed Insights UI

A modular implementation of Google PageSpeed Insights API with a clean, modern UI.

## Directory Structure

```
pagespeed/
├── page.tsx                      # Main page component
├── types.ts                      # TypeScript type definitions
├── README.md                     # This file
├── hooks/
│   └── usePageSpeedAPI.ts       # Custom hook for API calls
└── components/
    ├── PageSpeedForm.tsx        # URL input and configuration form
    ├── PageSpeedResults.tsx     # Main results display container
    ├── MetricsOverview.tsx      # Core Web Vitals metrics display
    └── CategoryDetails.tsx      # Detailed audit results by category
```

## Features

- ✅ Full PageSpeed Insights API integration
- ✅ **Simultaneous Desktop AND Mobile analysis** - Run both at once!
- ✅ Tabbed interface to switch between Desktop/Mobile results
- ✅ Performance scores shown in tab badges for quick comparison
- ✅ Multiple audit categories (Performance, Accessibility, Best Practices, SEO)
- ✅ Core Web Vitals display
- ✅ Detailed audit breakdowns
- ✅ Dark mode support
- ✅ Responsive design

## API Configuration

### Option 1: No Authentication (Limited Quota)
The API works without authentication but has limited quota. This is the default.

### Option 2: API Key (Recommended)
Add your Google API key to `.env.local`:

```env
NEXT_PUBLIC_GOOGLE_API_KEY=your_api_key_here
```

To get an API key:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable PageSpeed Insights API
4. Create credentials (API Key)
5. Add the key to your `.env.local` file

### Option 3: OAuth (Not Required for PageSpeed)
PageSpeed Insights API doesn't require OAuth authentication, but if needed for other Google APIs, you can use the existing `GoogleAPIProvider`.

## Usage

1. Navigate to `/tests/google-apis/pagespeed`
2. Enter a URL to analyze
3. Choose analysis categories (Performance, Accessibility, Best Practices, SEO)
4. Click "Analyze Desktop & Mobile"
5. **Both Desktop AND Mobile analyses run simultaneously** (takes 10-30 seconds)
6. Switch between Desktop/Mobile tabs to compare results
7. View comprehensive results including:
   - Overall scores per category (with quick comparison in tab badges)
   - Core Web Vitals metrics
   - Detailed audit results
   - Performance recommendations
   - Side-by-side comparison between device types

## Components

### `usePageSpeedAPI` Hook
Custom hook that handles API calls to PageSpeed Insights.

**Returns:**
- `runAnalysis(url, strategy, categories)` - Runs the analysis
- `loading` - Loading state
- `error` - Error message if any

### `PageSpeedForm`
Form component for URL input and analysis configuration.

**Props:**
- `onAnalyze` - Callback when form is submitted
- `loading` - Whether analysis is in progress

### `PageSpeedResults`
Main container for displaying analysis results.

**Props:**
- `data` - PageSpeed API response

### `MetricsOverview`
Displays Core Web Vitals and key performance metrics.

**Props:**
- `audits` - Audit results from Lighthouse

### `CategoryDetails`
Shows detailed audit results for a specific category.

**Props:**
- `category` - Category data
- `audits` - All audit results

## API Reference

The PageSpeed Insights API endpoint:
```
GET https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed
```

**Query Parameters:**
- `url` (required) - URL to analyze
- `strategy` - "desktop" or "mobile" (default: desktop)
- `category` - One or more of: PERFORMANCE, ACCESSIBILITY, BEST_PRACTICES, SEO
- `locale` - Locale for results (default: en)
- `key` - API key (optional but recommended)

## Lighthouse Categories

- **Performance**: Speed and optimization metrics
- **Accessibility**: A11y best practices
- **Best Practices**: Web development standards
- **SEO**: Search engine optimization

## Core Web Vitals

- **First Contentful Paint (FCP)**: When the first content is rendered
- **Largest Contentful Paint (LCP)**: When the largest content is rendered
- **Total Blocking Time (TBT)**: Time when the page is blocked from responding
- **Cumulative Layout Shift (CLS)**: Visual stability metric
- **Speed Index**: How quickly content is visually displayed
- **Time to Interactive (TTI)**: When the page becomes fully interactive

## Migration Plan

Once tested and working, components can be moved to:
- Hook: `hooks/google-apis/usePageSpeedAPI.ts`
- Components: `components/google-apis/pagespeed/`
- Types: `types/google-apis/pagespeed.ts`

